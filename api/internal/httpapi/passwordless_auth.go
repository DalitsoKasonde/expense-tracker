package httpapi

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	stdmail "net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	appmail "github.com/dalitsokasonde/expense-tracker/api/internal/mail"
	"github.com/dalitsokasonde/expense-tracker/api/internal/plans"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

const loginPINLifetime = 10 * time.Minute

func (s *Server) requestLoginPIN(w http.ResponseWriter, r *http.Request) {
	if !s.config.MailEnabled() {
		http.Error(w, "email sign-in is not configured on this server", http.StatusServiceUnavailable)
		return
	}
	var request struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	email, valid := normalizeLoginEmail(request.Email)
	if !valid {
		http.Error(w, "enter a valid email address", http.StatusBadRequest)
		return
	}

	// The same accepted response is returned for unknown, inactive, and
	// password-only operator accounts so this endpoint cannot enumerate users.
	user, err := s.users.FindByEmail(r.Context(), email)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && (!user.IsActive || user.Role == "system_admin")) {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	if err != nil {
		http.Error(w, "email sign-in is temporarily unavailable", http.StatusServiceUnavailable)
		return
	}

	pin, err := newLoginPIN()
	if err != nil {
		http.Error(w, "email sign-in is temporarily unavailable", http.StatusInternalServerError)
		return
	}
	if err := s.loginPins.Replace(r.Context(), user.ID, hashLoginPIN(s.config.JWTSecret, user.ID, pin), time.Now().Add(loginPINLifetime)); err != nil {
		http.Error(w, "email sign-in is temporarily unavailable", http.StatusInternalServerError)
		return
	}

	err = s.mailer.send(r.Context(), outgoing{
		UserID:    &user.ID,
		Recipient: user.Email,
		Kind:      store.EmailKindLoginPIN,
		Subject:   "Your Inscribed Expenses sign-in code",
		Document: appmail.Document{
			Preheader: "Your code expires in 10 minutes.",
			Heading:   "Sign in to Inscribed Expenses",
			Blocks: []appmail.Block{
				appmail.Paragraph(greeting(user.DisplayName)),
				appmail.Paragraph("Enter this one-time code on the sign-in screen:"),
				appmail.FactList{{Label: "Sign-in code", Value: pin}},
				appmail.Paragraph("The code expires in 10 minutes and stops working after you use it."),
				appmail.Paragraph("If you did not request this code, you can ignore this email."),
			},
			FooterNote: "Inscribed Expenses never asks you to send this code to another person.",
		},
	})
	if err != nil {
		_ = s.loginPins.Delete(r.Context(), user.ID)
		log.Printf("mail: could not send login PIN for user %s: %v", user.ID, err)
	}
	w.WriteHeader(http.StatusAccepted)
}

func (s *Server) verifyLoginPIN(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Email string `json:"email"`
		PIN   string `json:"pin"`
	}
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	email, valid := normalizeLoginEmail(request.Email)
	pin := strings.TrimSpace(request.PIN)
	if !valid || len(pin) != 6 || strings.Trim(pin, "0123456789") != "" {
		http.Error(w, "invalid or expired sign-in code", http.StatusUnauthorized)
		return
	}

	user, err := s.users.FindByEmail(r.Context(), email)
	if err != nil || !user.IsActive || user.Role == "system_admin" {
		http.Error(w, "invalid or expired sign-in code", http.StatusUnauthorized)
		return
	}
	if err := s.loginPins.Consume(r.Context(), user.ID, hashLoginPIN(s.config.JWTSecret, user.ID, pin)); err != nil {
		http.Error(w, "invalid or expired sign-in code", http.StatusUnauthorized)
		return
	}
	if err := s.users.MarkEmailVerified(r.Context(), user.ID); err != nil {
		http.Error(w, "could not complete sign-in", http.StatusInternalServerError)
		return
	}
	s.completeLogin(w, r, user)
}

func (s *Server) googleLogin(w http.ResponseWriter, r *http.Request) {
	if s.config.GoogleClientID == "" {
		http.Error(w, "Google sign-in is not configured on this server", http.StatusServiceUnavailable)
		return
	}
	var request struct {
		IDToken string `json:"idToken"`
	}
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	identity, err := s.googleVerifier.Verify(r.Context(), request.IDToken, s.config.GoogleClientID)
	if err != nil {
		http.Error(w, "Google sign-in failed", http.StatusUnauthorized)
		return
	}

	user, err := s.users.FindByGoogleSubject(r.Context(), identity.Subject)
	if errors.Is(err, pgx.ErrNoRows) {
		user, err = s.users.FindByEmail(r.Context(), identity.Email)
		if errors.Is(err, pgx.ErrNoRows) {
			name := identity.Name
			if name == "" {
				name = strings.Split(identity.Email, "@")[0]
			}
			secret, _, secretErr := store.NewToken()
			if secretErr != nil {
				http.Error(w, "Google sign-in is temporarily unavailable", http.StatusInternalServerError)
				return
			}
			passwordHash, hashErr := auth.HashPassword(secret)
			if hashErr != nil {
				http.Error(w, "Google sign-in is temporarily unavailable", http.StatusInternalServerError)
				return
			}
			user, err = s.users.CreateGoogleUser(
				r.Context(), identity.Email, passwordHash, name, identity.Subject,
				// Someone arriving through Google gets the same trial as anyone
				// else; how a person signed in should not decide entitlement.
				plans.Premium, plans.TrialExpiry(plans.SignupTrialMonths, time.Now()), plans.SourceSignup,
			)
		} else if err == nil {
			if user.Role == "system_admin" || !user.IsActive {
				http.Error(w, "Google sign-in failed", http.StatusUnauthorized)
				return
			}
			err = s.users.LinkGoogleIdentity(r.Context(), user.ID, identity.Subject)
		}
	}
	if err != nil || !user.IsActive || user.Role == "system_admin" {
		http.Error(w, "Google sign-in failed", http.StatusUnauthorized)
		return
	}
	s.completeLogin(w, r, user)
}

func (s *Server) completeLogin(w http.ResponseWriter, r *http.Request, user store.User) {
	token, err := auth.IssueToken(s.config.JWTSecret, user.ID, user.Role)
	if err != nil {
		http.Error(w, "could not issue token", http.StatusInternalServerError)
		return
	}
	if err := s.users.RecordLogin(r.Context(), user.ID); err != nil {
		http.Error(w, "could not record login", http.StatusInternalServerError)
		return
	}
	setAuthCookie(w, s.config, token)
	writeJSON(w, http.StatusOK, map[string]any{
		"accessToken": token,
		"user": map[string]string{
			"id":          user.ID,
			"email":       user.Email,
			"displayName": user.DisplayName,
			"role":        user.Role,
		},
	})
}

func normalizeLoginEmail(value string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(value))
	if email == "" || len(email) > 254 {
		return "", false
	}
	parsed, err := stdmail.ParseAddress(email)
	return email, err == nil && parsed.Address == email
}

func newLoginPIN() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func hashLoginPIN(secret, userID, pin string) string {
	digest := hmac.New(sha256.New, []byte(secret))
	digest.Write([]byte(userID))
	digest.Write([]byte{0})
	digest.Write([]byte(pin))
	return hex.EncodeToString(digest.Sum(nil))
}
