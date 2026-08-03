package auth

import (
	"context"
	"net/http"
	"slices"
	"strings"
)

type contextKey string

const claimsKey contextKey = "claims"

func Middleware(secret, cookieName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenString := bearerToken(r.Header.Get("Authorization"))
			if tokenString == "" && cookieName != "" {
				if cookie, err := r.Cookie(cookieName); err == nil {
					tokenString = cookie.Value
				}
			}

			if tokenString == "" {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			claims, err := ParseToken(secret, tokenString)
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := ClaimsFromContext(r.Context())
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			if !slices.Contains(roles, claims.Role) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// SystemAdminBoundary prevents an administrative identity from ever falling
// through to member financial handlers. Admin identities may only use auth
// lifecycle endpoints and the explicitly separated /v1/admin API.
func SystemAdminBoundary(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := ClaimsFromContext(r.Context())
		if ok && claims.Role == "system_admin" &&
			!strings.HasPrefix(r.URL.Path, "/v1/admin/") &&
			!strings.HasPrefix(r.URL.Path, "/api/v1/admin/") &&
			!strings.HasPrefix(r.URL.Path, "/v1/auth/") &&
			!strings.HasPrefix(r.URL.Path, "/api/v1/auth/") {
			http.Error(w, "system administrators cannot access member financial data", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func bearerToken(header string) string {
	if header == "" {
		return ""
	}

	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return ""
	}

	return parts[1]
}

func ClaimsFromContext(ctx context.Context) (*Claims, bool) {
	claims, ok := ctx.Value(claimsKey).(*Claims)
	return claims, ok
}
