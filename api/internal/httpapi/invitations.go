package httpapi

import (
	"errors"
	"net/http"
	stdmail "net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	appmail "github.com/dalitsokasonde/expense-tracker/api/internal/mail"
	"github.com/dalitsokasonde/expense-tracker/api/internal/plans"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

// An invitation outlives a password reset because it is an offer, not a
// security-sensitive recovery: a fortnight survives a holiday.
const invitationLifetime = 14 * 24 * time.Hour

func (s *Server) createInvitation(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var request struct {
		Email         string `json:"email"`
		PremiumMonths *int   `json:"premiumMonths"`
		Note          string `json:"note"`
	}
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	email := strings.ToLower(strings.TrimSpace(request.Email))
	if _, err := stdmail.ParseAddress(email); err != nil {
		http.Error(w, "enter a valid email address", http.StatusBadRequest)
		return
	}

	months := plans.InviteTrialMonths
	if request.PremiumMonths != nil {
		months = *request.PremiumMonths
	}
	if months < 0 || months > 60 {
		http.Error(w, "premiumMonths must be between 0 and 60", http.StatusBadRequest)
		return
	}

	// Inviting an address that already has an account would produce a link
	// that cannot be accepted, so it is refused with something actionable.
	if _, err := s.users.FindByEmail(r.Context(), email); err == nil {
		http.Error(w, "that email already has an account", http.StatusConflict)
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		writeInternalError(w, r, "invitations.create.lookup", "the invitation could not be created", err)
		return
	}

	secret, hash, err := store.NewToken()
	if err != nil {
		writeInternalError(w, r, "invitations.create.token", "the invitation could not be created", err)
		return
	}

	invitation, err := s.invitations.Create(
		r.Context(), email, hash, claims.UserID, months,
		strings.TrimSpace(request.Note), time.Now().Add(invitationLifetime),
	)
	if err != nil {
		writeInternalError(w, r, "invitations.create", "the invitation could not be created", err)
		return
	}

	link := s.mailer.tokenLink("/invite", secret)
	err = s.mailer.send(r.Context(), outgoing{
		Recipient: email,
		Kind:      store.EmailKindInvitation,
		Subject:   "You are invited to Inscribed Expenses",
		Document: appmail.Document{
			Preheader: "Your invitation link is inside.",
			Heading:   "You are invited to Inscribed Expenses",
			Blocks: []appmail.Block{
				appmail.Paragraph("Inscribed Expenses is a personal money tracker built for Zambian finances — bank accounts, Airtel and MTN mobile money, savings, debts and investments in one place."),
				appmail.Paragraph("Use the button below to set a password and start. Your invitation includes " + describeMonths(months) + " of the premium plan at no cost."),
				appmail.Button{Label: "Accept the invitation", URL: link},
				appmail.Paragraph("This invitation expires in 14 days. If you were not expecting it, you can ignore this email."),
			},
			FooterNote: "You received this because someone at Inscribed invited this address to the beta.",
		},
	})
	if err != nil {
		// The invitation row is real and the link works; only the delivery
		// failed. Revoking it would be worse — the admin can resend, and the
		// response says plainly that the email did not go out.
		writeJSON(w, http.StatusCreated, map[string]any{
			"invitation": invitation,
			"emailed":    false,
			"message":    "The invitation was created but the email could not be sent.",
		})
		return
	}

	s.recordAdminAudit(r, claims.UserID, "invitation.created", "invitation", &invitation.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"invitation": invitation, "emailed": true})
}

func describeMonths(months int) string {
	switch {
	case months <= 0:
		return "no free period"
	case months == 1:
		return "one month"
	default:
		return strconv.Itoa(months) + " months"
	}
}

func (s *Server) listInvitations(w http.ResponseWriter, r *http.Request) {
	items, err := s.invitations.List(r.Context())
	if err != nil {
		writeInternalError(w, r, "invitations.list", "invitations are temporarily unavailable", err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) revokeInvitation(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if err := s.invitations.Revoke(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrInvitationInvalid) {
			http.Error(w, "that invitation has already been used or revoked", http.StatusConflict)
			return
		}
		writeInternalError(w, r, "invitations.revoke", "the invitation could not be revoked", err)
		return
	}

	s.recordAdminAudit(r, claims.UserID, "invitation.revoked", "invitation", &id)
	w.WriteHeader(http.StatusNoContent)
}

// previewInvitation lets the accept screen show which address an invitation is
// for without spending it. It deliberately reveals nothing about an invalid
// token beyond the fact that it does not work.
func (s *Server) previewInvitation(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		http.Error(w, "this invitation link is invalid or has expired", http.StatusBadRequest)
		return
	}

	invitation, err := s.invitations.Lookup(r.Context(), store.HashToken(token))
	if err != nil {
		http.Error(w, "this invitation link is invalid or has expired", http.StatusBadRequest)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"email":         invitation.Email,
		"premiumMonths": invitation.PremiumMonths,
	})
}

func (s *Server) acceptInvitation(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Token       string `json:"token"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
	}
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	token := strings.TrimSpace(request.Token)
	displayName := strings.TrimSpace(request.DisplayName)
	if token == "" || displayName == "" {
		http.Error(w, "token and displayName are required", http.StatusBadRequest)
		return
	}
	// Checked before the invitation is spent, so a weak password costs a retry
	// rather than the whole invitation.
	if err := auth.ValidatePassword(request.Password); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tokenHash := store.HashToken(token)
	invitation, err := s.invitations.Lookup(r.Context(), tokenHash)
	if err != nil {
		http.Error(w, "this invitation link is invalid or has expired", http.StatusBadRequest)
		return
	}

	if _, err := s.users.FindByEmail(r.Context(), invitation.Email); err == nil {
		http.Error(w, "that email already has an account", http.StatusConflict)
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		writeInternalError(w, r, "invitations.accept.lookup", "the invitation could not be accepted", err)
		return
	}

	hash, err := auth.HashPassword(request.Password)
	if err != nil {
		writeInternalError(w, r, "invitations.accept.hash", "the invitation could not be accepted", err)
		return
	}

	user, err := s.users.CreateUser(r.Context(), store.NewUser{
		Email:         invitation.Email,
		PasswordHash:  hash,
		DisplayName:   displayName,
		Plan:          plans.Premium,
		PlanExpiresAt: plans.TrialExpiry(invitation.PremiumMonths, time.Now()),
		PlanSource:    plans.SourceInvite,
	})
	if err != nil {
		writeInternalError(w, r, "invitations.accept.create", "the invitation could not be accepted", err)
		return
	}

	// Spending the invitation last means a failure anywhere above leaves the
	// link usable rather than burning it on an account that was never created.
	if _, err := s.invitations.Accept(r.Context(), tokenHash, user.ID); err != nil {
		writeInternalError(w, r, "invitations.accept.spend", "the invitation could not be accepted", err)
		return
	}

	// The address is proven by the fact that the invitation reached it.
	if err := s.users.MarkEmailVerified(r.Context(), user.ID); err != nil {
		writeInternalError(w, r, "invitations.accept.verify", "the invitation could not be accepted", err)
		return
	}

	s.completeLogin(w, r, user)
}
