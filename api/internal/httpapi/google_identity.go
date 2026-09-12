package httpapi

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const googleJWKSetURL = "https://www.googleapis.com/oauth2/v3/certs"

type googleIdentity struct {
	Subject string
	Email   string
	Name    string
}

type googleIDClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	jwt.RegisteredClaims
}

type googleJWK struct {
	KeyID     string `json:"kid"`
	KeyType   string `json:"kty"`
	Algorithm string `json:"alg"`
	Modulus   string `json:"n"`
	Exponent  string `json:"e"`
}

type googleIdentityVerifier struct {
	client    *http.Client
	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	expiresAt time.Time
}

func newGoogleIdentityVerifier() *googleIdentityVerifier {
	return &googleIdentityVerifier{client: &http.Client{Timeout: 10 * time.Second}}
}

func (v *googleIdentityVerifier) Verify(ctx context.Context, rawToken, audience string) (googleIdentity, error) {
	if strings.TrimSpace(rawToken) == "" || strings.TrimSpace(audience) == "" {
		return googleIdentity{}, errors.New("Google token or audience is missing")
	}

	claims := &googleIDClaims{}
	token, err := jwt.ParseWithClaims(rawToken, claims, func(token *jwt.Token) (any, error) {
		keyID, _ := token.Header["kid"].(string)
		if keyID == "" {
			return nil, errors.New("Google token has no key identifier")
		}
		return v.publicKey(ctx, keyID)
	}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithAudience(audience), jwt.WithExpirationRequired())
	if err != nil || !token.Valid {
		return googleIdentity{}, errors.New("Google token is invalid")
	}
	if claims.Issuer != "accounts.google.com" && claims.Issuer != "https://accounts.google.com" {
		return googleIdentity{}, errors.New("Google token issuer is invalid")
	}
	if !claims.EmailVerified || strings.TrimSpace(claims.Email) == "" || strings.TrimSpace(claims.Subject) == "" {
		return googleIdentity{}, errors.New("Google account email is not verified")
	}

	return googleIdentity{
		Subject: strings.TrimSpace(claims.Subject),
		Email:   strings.ToLower(strings.TrimSpace(claims.Email)),
		Name:    strings.TrimSpace(claims.Name),
	}, nil
}

func (v *googleIdentityVerifier) publicKey(ctx context.Context, keyID string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if time.Now().Before(v.expiresAt) {
		if key := v.keys[keyID]; key != nil {
			return key, nil
		}
	}
	if err := v.refresh(ctx); err != nil {
		return nil, err
	}
	if key := v.keys[keyID]; key != nil {
		return key, nil
	}
	return nil, errors.New("Google signing key is unknown")
}

// refresh runs with v.mu held so a key rotation causes one fetch, not one fetch
// per concurrent login. Google's Cache-Control header defines the refresh time.
func (v *googleIdentityVerifier) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleJWKSetURL, nil)
	if err != nil {
		return err
	}
	response, err := v.client.Do(req)
	if err != nil {
		return fmt.Errorf("fetch Google signing keys: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("fetch Google signing keys: status %d", response.StatusCode)
	}

	var set struct {
		Keys []googleJWK `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&set); err != nil {
		return fmt.Errorf("decode Google signing keys: %w", err)
	}
	keys := make(map[string]*rsa.PublicKey, len(set.Keys))
	for _, item := range set.Keys {
		if item.KeyType != "RSA" || item.Algorithm != "RS256" || item.KeyID == "" {
			continue
		}
		key, err := rsaKeyFromJWK(item)
		if err != nil {
			continue
		}
		keys[item.KeyID] = key
	}
	if len(keys) == 0 {
		return errors.New("Google returned no usable signing keys")
	}

	v.keys = keys
	v.expiresAt = time.Now().Add(cacheMaxAge(response.Header.Get("Cache-Control")))
	return nil
}

func rsaKeyFromJWK(item googleJWK) (*rsa.PublicKey, error) {
	modulus, err := base64.RawURLEncoding.DecodeString(item.Modulus)
	if err != nil || len(modulus) == 0 {
		return nil, errors.New("invalid RSA modulus")
	}
	exponentBytes, err := base64.RawURLEncoding.DecodeString(item.Exponent)
	if err != nil || len(exponentBytes) == 0 || len(exponentBytes) > 4 {
		return nil, errors.New("invalid RSA exponent")
	}
	exponent := 0
	for _, value := range exponentBytes {
		exponent = exponent<<8 | int(value)
	}
	if exponent < 3 {
		return nil, errors.New("invalid RSA exponent")
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(modulus), E: exponent}, nil
}

func cacheMaxAge(header string) time.Duration {
	for _, directive := range strings.Split(header, ",") {
		name, value, found := strings.Cut(strings.TrimSpace(directive), "=")
		if found && strings.EqualFold(name, "max-age") {
			seconds, err := strconv.Atoi(strings.Trim(value, `"`))
			if err == nil && seconds > 0 {
				return time.Duration(seconds) * time.Second
			}
		}
	}
	return time.Hour
}
