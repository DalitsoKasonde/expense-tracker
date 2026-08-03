package httpapi

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
)

// requireCurrentUser makes account suspension and role changes effective on
// the next request instead of waiting for an already-issued JWT to expire.
func (s *Server) requireCurrentUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		state, err := s.users.GetAuthState(r.Context(), claims.UserID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			http.Error(w, "authentication unavailable", http.StatusServiceUnavailable)
			return
		}
		if !state.IsActive || state.Role != claims.Role {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
