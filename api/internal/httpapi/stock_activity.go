package httpapi

import (
	"net/http"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
)

// stockActivity serves the stock dashboard's investing-habit figures. "This
// month" is the Lusaka calendar month: the container clock is UTC, which would
// put a purchase on the evening of the 31st into the wrong month for two hours.
func (s *Server) stockActivity(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	activity, err := s.assetLots.StockActivity(r.Context(), claims.UserID, time.Now().In(lusakaLocation))
	if err != nil {
		writeInternalError(w, r, "investments.stock_activity", "investing activity is temporarily unavailable", err)
		return
	}
	writeJSON(w, http.StatusOK, activity)
}
