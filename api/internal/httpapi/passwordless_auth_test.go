package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"regexp"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestLoginPINIsSixDigitsAndBoundToAccountAndServerSecret(t *testing.T) {
	for range 25 {
		pin, err := newLoginPIN()
		if err != nil {
			t.Fatal(err)
		}
		if !regexp.MustCompile(`^\d{6}$`).MatchString(pin) {
			t.Fatalf("PIN %q is not six digits", pin)
		}
	}

	base := hashLoginPIN("secret-a", "user-a", "123456")
	if base == hashLoginPIN("secret-a", "user-b", "123456") {
		t.Fatal("the same PIN produced the same digest for different users")
	}
	if base == hashLoginPIN("secret-b", "user-a", "123456") {
		t.Fatal("the same PIN produced the same digest for different server secrets")
	}
}

func TestGoogleIdentityVerifierChecksAudienceIssuerAndVerifiedEmail(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	verifier := newGoogleIdentityVerifier()
	verifier.keys = map[string]*rsa.PublicKey{"test-key": &privateKey.PublicKey}
	verifier.expiresAt = time.Now().Add(time.Hour)

	sign := func(audience, issuer string, verified bool) string {
		t.Helper()
		claims := googleIDClaims{
			Email:         "person@example.com",
			EmailVerified: verified,
			Name:          "Person Example",
			RegisteredClaims: jwt.RegisteredClaims{
				Subject:   "google-account-1",
				Audience:  jwt.ClaimStrings{audience},
				Issuer:    issuer,
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
				IssuedAt:  jwt.NewNumericDate(time.Now()),
			},
		}
		token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
		token.Header["kid"] = "test-key"
		raw, signErr := token.SignedString(privateKey)
		if signErr != nil {
			t.Fatal(signErr)
		}
		return raw
	}

	identity, err := verifier.Verify(context.Background(), sign("client-1", "https://accounts.google.com", true), "client-1")
	if err != nil {
		t.Fatalf("valid Google token rejected: %v", err)
	}
	if identity.Subject != "google-account-1" || identity.Email != "person@example.com" {
		t.Fatalf("unexpected identity: %#v", identity)
	}
	if _, err := verifier.Verify(context.Background(), sign("another-client", "https://accounts.google.com", true), "client-1"); err == nil {
		t.Fatal("token for another OAuth client was accepted")
	}
	if _, err := verifier.Verify(context.Background(), sign("client-1", "https://issuer.example.com", true), "client-1"); err == nil {
		t.Fatal("token from another issuer was accepted")
	}
	if _, err := verifier.Verify(context.Background(), sign("client-1", "accounts.google.com", false), "client-1"); err == nil {
		t.Fatal("token with an unverified email was accepted")
	}
}

func TestGoogleKeyCacheHonorsMaxAge(t *testing.T) {
	if got := cacheMaxAge("public, max-age=1800, must-revalidate"); got != 30*time.Minute {
		t.Fatalf("cache max age = %s", got)
	}
	if got := cacheMaxAge(""); got != time.Hour {
		t.Fatalf("default cache max age = %s", got)
	}
}
