package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/mail"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

const (
	// Short enough that a reset link left in an inbox stops working the same
	// day, long enough to survive a delayed delivery.
	passwordResetLifetime = time.Hour
	verifyEmailLifetime   = 48 * time.Hour
)

// forgotPassword always reports success. Answering differently for a registered
// and an unregistered address would turn this endpoint into a way to discover
// who has an account.
func (s *Server) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	email := strings.TrimSpace(strings.ToLower(request.Email))
	if email == "" {
		http.Error(w, "email is required", http.StatusBadRequest)
		return
	}

	user, err := s.users.FindByEmail(r.Context(), email)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		w.WriteHeader(http.StatusNoContent)
		return
	case err != nil:
		writeInternalError(w, r, "auth.forgot_password.lookup", "password reset is temporarily unavailable", err)
		return
	case !user.IsActive:
		// A deactivated account should not be recoverable by its owner, and
		// saying so would leak that the account exists.
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if err := s.sendPasswordReset(r.Context(), user); err != nil {
		writeInternalError(w, r, "auth.forgot_password.send", "password reset is temporarily unavailable", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) sendPasswordReset(ctx context.Context, user store.User) error {
	secret, hash, err := store.NewToken()
	if err != nil {
		return err
	}
	if err := s.authTokens.Create(ctx, user.ID, store.AuthTokenPasswordReset, hash, time.Now().Add(passwordResetLifetime)); err != nil {
		return err
	}

	link := s.mailer.tokenLink("/reset-password", secret)
	return s.mailer.send(ctx, outgoing{
		UserID:    &user.ID,
		Recipient: user.Email,
		Kind:      store.EmailKindPasswordReset,
		Subject:   "Reset your Chuma password",
		Document: mail.Document{
			Preheader: "This link works for one hour.",
			Heading:   "Reset your password",
			Blocks: []mail.Block{
				mail.Paragraph(greeting(user.DisplayName)),
				mail.Paragraph("Use the button below to choose a new password. The link works once and expires in one hour."),
				mail.Button{Label: "Choose a new password", URL: link},
				mail.Paragraph("If you did not ask for this, you can ignore this email — your password stays as it is."),
			},
			FooterNote: "Chuma never asks for your password by email.",
		},
	})
}

func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	token := strings.TrimSpace(request.Token)
	if token == "" {
		http.Error(w, "token is required", http.StatusBadRequest)
		return
	}
	// Validating the new password before spending the token means a weak
	// password costs a retry, not a whole new reset email.
	if err := auth.ValidatePassword(request.Password); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	userID, err := s.authTokens.Consume(r.Context(), store.AuthTokenPasswordReset, token)
	if errors.Is(err, store.ErrTokenInvalid) {
		http.Error(w, "this reset link is invalid or has expired", http.StatusBadRequest)
		return
	}
	if err != nil {
		writeInternalError(w, r, "auth.reset_password.consume", "password reset is temporarily unavailable", err)
		return
	}

	hash, err := auth.HashPassword(request.Password)
	if err != nil {
		writeInternalError(w, r, "auth.reset_password.hash", "password reset is temporarily unavailable", err)
		return
	}
	if err := s.users.UpdatePassword(r.Context(), userID, hash); err != nil {
		writeInternalError(w, r, "auth.reset_password.update", "password reset is temporarily unavailable", err)
		return
	}
	// Any other reset link already in flight is now stale — if the request came
	// from an attacker, the real owner's link must not still work either.
	if err := s.authTokens.InvalidateAll(r.Context(), userID, store.AuthTokenPasswordReset); err != nil {
		writeInternalError(w, r, "auth.reset_password.invalidate", "password reset is temporarily unavailable", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// sendVerificationEmail is triggered by the signed-in user, so it reads the
// address from the account rather than the request: letting a caller name the
// destination would make this a way to send mail to anyone.
func (s *Server) sendVerificationEmail(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := s.users.FindByID(r.Context(), claims.UserID)
	if err != nil {
		writeInternalError(w, r, "auth.verify_email.lookup", "verification is temporarily unavailable", err)
		return
	}
	if user.EmailVerifiedAt != nil {
		writeJSON(w, http.StatusOK, map[string]any{"alreadyVerified": true})
		return
	}

	secret, hash, err := store.NewToken()
	if err != nil {
		writeInternalError(w, r, "auth.verify_email.token", "verification is temporarily unavailable", err)
		return
	}
	if err := s.authTokens.Create(r.Context(), user.ID, store.AuthTokenVerifyEmail, hash, time.Now().Add(verifyEmailLifetime)); err != nil {
		writeInternalError(w, r, "auth.verify_email.store", "verification is temporarily unavailable", err)
		return
	}

	link := s.mailer.tokenLink("/verify-email", secret)
	err = s.mailer.send(r.Context(), outgoing{
		UserID:    &user.ID,
		Recipient: user.Email,
		Kind:      store.EmailKindVerification,
		Subject:   "Confirm your email address",
		Document: mail.Document{
			Preheader: "One click and your address is confirmed.",
			Heading:   "Confirm your email address",
			Blocks: []mail.Block{
				mail.Paragraph(greeting(user.DisplayName)),
				mail.Paragraph("Confirming your address is what lets Chuma send you password resets and the summaries you asked for."),
				mail.Button{Label: "Confirm my address", URL: link},
				mail.Paragraph("This link expires in two days."),
			},
			FooterNote: "You are receiving this because this address was used to sign up for Chuma.",
		},
	})
	if err != nil {
		writeInternalError(w, r, "auth.verify_email.send", "verification is temporarily unavailable", err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"alreadyVerified": false,
		"sentTo":          user.Email,
		"delivered":       s.config.MailEnabled(),
	})
}

func (s *Server) verifyEmail(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	token := strings.TrimSpace(request.Token)
	if token == "" {
		http.Error(w, "token is required", http.StatusBadRequest)
		return
	}

	userID, err := s.authTokens.Consume(r.Context(), store.AuthTokenVerifyEmail, token)
	if errors.Is(err, store.ErrTokenInvalid) {
		http.Error(w, "this confirmation link is invalid or has expired", http.StatusBadRequest)
		return
	}
	if err != nil {
		writeInternalError(w, r, "auth.verify_email.consume", "verification is temporarily unavailable", err)
		return
	}

	if err := s.users.MarkEmailVerified(r.Context(), userID); err != nil {
		writeInternalError(w, r, "auth.verify_email.mark", "verification is temporarily unavailable", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
