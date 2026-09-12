package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/plans"
)

type planResponse struct {
	// Plan is what the person is entitled to right now, already resolved
	// against the clock. Clients must never be handed the stored column: a
	// lapsed trial still reads "premium" there.
	Plan      string  `json:"plan"`
	ExpiresAt *string `json:"expiresAt"`
	Source    string  `json:"source"`
	// Limits are advertised before they are enforced, so the app can show
	// someone where they stand rather than surprising them at the ceiling.
	Limits      plans.Limits `json:"limits"`
	PriceMinor  int64        `json:"priceMinor"`
	PriceCurren string       `json:"priceCurrency"`
}

// premiumPriceMinor is K20.00 in ngwee. Money is always minor units.
const premiumPriceMinor int64 = 20_00

func (s *Server) getUserPlan(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := s.users.FindByID(r.Context(), claims.UserID)
	if err != nil {
		writeInternalError(w, r, "plan.get", "your plan is temporarily unavailable", err)
		return
	}

	writeJSON(w, http.StatusOK, buildPlanResponse(user.Plan, user.PlanExpiresAt, user.PlanSource, time.Now()))
}

// buildPlanResponse is pure so the resolution rules can be tested without a
// database or a request.
func buildPlanResponse(plan string, expiresAt *time.Time, source string, now time.Time) planResponse {
	effective := plans.Effective(plan, expiresAt, now)

	var expiry *string
	// An expiry is only meaningful while the plan it belongs to still stands.
	if expiresAt != nil && effective == plans.Premium {
		formatted := expiresAt.Format(time.RFC3339)
		expiry = &formatted
	}

	return planResponse{
		Plan:        effective,
		ExpiresAt:   expiry,
		Source:      source,
		Limits:      plans.LimitsFor(effective),
		PriceMinor:  premiumPriceMinor,
		PriceCurren: "ZMW",
	}
}

func (s *Server) updateAdminUserPlan(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var request struct {
		Plan string `json:"plan"`
		// Months grants a premium period from now. NeverExpires grants one that
		// does not lapse — the complimentary accounts.
		Months       *int `json:"months"`
		NeverExpires bool `json:"neverExpires"`
	}
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	plan := strings.ToLower(strings.TrimSpace(request.Plan))
	if plan != plans.Free && plan != plans.Premium {
		http.Error(w, "plan must be free or premium", http.StatusBadRequest)
		return
	}

	targetID := strings.TrimSpace(chi.URLParam(r, "id"))
	if targetID == "" {
		http.Error(w, "user id is required", http.StatusBadRequest)
		return
	}

	var expiresAt *time.Time
	source := plans.SourceComp
	switch {
	case plan == plans.Free:
		// Downgrading clears the expiry; a date on a free plan means nothing
		// and would be misread by anyone looking at the row later.
		expiresAt = nil
	case request.NeverExpires:
		expiresAt = nil
	case request.Months != nil:
		if *request.Months < 1 || *request.Months > 600 {
			http.Error(w, "months must be between 1 and 600", http.StatusBadRequest)
			return
		}
		expiresAt = plans.TrialExpiry(*request.Months, time.Now())
	default:
		http.Error(w, "granting premium requires either months or neverExpires", http.StatusBadRequest)
		return
	}

	if err := s.users.SetPlan(r.Context(), targetID, plan, expiresAt, source); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		writeInternalError(w, r, "plan.update", "the plan could not be changed", err)
		return
	}

	s.recordAdminAudit(r, claims.UserID, "plan."+plan, "user", &targetID)
	writeJSON(w, http.StatusOK, buildPlanResponse(plan, expiresAt, source, time.Now()))
}
