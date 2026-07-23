package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/jackc/pgx/v5"
)

const maxOnboardingAccounts = 12

var validOnboardingInterests = map[string]struct{}{
	"loans":  {},
	"stocks": {},
	"bonds":  {},
}

type onboardingAccountRequest struct {
	Name                string `json:"name"`
	AccountType         string `json:"accountType"`
	OpeningBalanceMinor int64  `json:"openingBalanceMinor"`
}

type completeOnboardingRequest struct {
	DefaultCurrency string                     `json:"defaultCurrency"`
	Accounts        []onboardingAccountRequest `json:"accounts"`
	Interests       []string                   `json:"interests"`
}

type onboardingStatusResponse struct {
	Completed       bool     `json:"completed"`
	Interests       []string `json:"interests"`
	AccountsCreated int      `json:"accountsCreated,omitempty"`
}

func normalizeOnboardingRequest(request completeOnboardingRequest) (completeOnboardingRequest, error) {
	currency, err := normalizeCurrency(request.DefaultCurrency)
	if err != nil {
		return completeOnboardingRequest{}, err
	}
	if len(request.Accounts) > maxOnboardingAccounts {
		return completeOnboardingRequest{}, errors.New("onboarding supports up to 12 accounts")
	}

	accounts := make([]onboardingAccountRequest, 0, len(request.Accounts))
	accountNames := make(map[string]struct{}, len(request.Accounts))
	for _, account := range request.Accounts {
		name, err := normalizeRequiredName(account.Name)
		if err != nil {
			return completeOnboardingRequest{}, errors.New("every account needs a name")
		}
		nameKey := strings.ToLower(name)
		if _, exists := accountNames[nameKey]; exists {
			return completeOnboardingRequest{}, errors.New("account names must be unique")
		}
		accountNames[nameKey] = struct{}{}

		accountType, err := normalizeAllowedValue(account.AccountType, "cash", validAccountTypes, "accountType")
		if err != nil {
			return completeOnboardingRequest{}, err
		}
		accounts = append(accounts, onboardingAccountRequest{
			Name:                name,
			AccountType:         accountType,
			OpeningBalanceMinor: account.OpeningBalanceMinor,
		})
	}

	interests := make([]string, 0, len(request.Interests))
	seenInterests := make(map[string]struct{}, len(request.Interests))
	for _, rawInterest := range request.Interests {
		interest := strings.ToLower(strings.TrimSpace(rawInterest))
		if _, valid := validOnboardingInterests[interest]; !valid {
			return completeOnboardingRequest{}, errors.New("onboarding interest is invalid")
		}
		if _, duplicate := seenInterests[interest]; duplicate {
			continue
		}
		seenInterests[interest] = struct{}{}
		interests = append(interests, interest)
	}

	return completeOnboardingRequest{
		DefaultCurrency: currency,
		Accounts:        accounts,
		Interests:       interests,
	}, nil
}

func (s *Server) getOnboardingStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var response onboardingStatusResponse
	err := s.db.QueryRow(r.Context(), `
		select onboarding_completed_at is not null, onboarding_interests
		from users
		where id = $1
	`, claims.UserID).Scan(&response.Completed, &response.Interests)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to load onboarding status", http.StatusInternalServerError)
		return
	}
	if response.Interests == nil {
		response.Interests = []string{}
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *Server) completeOnboarding(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var rawRequest completeOnboardingRequest
	if err := decodeJSON(r, &rawRequest); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	request, err := normalizeOnboardingRequest(rawRequest)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		http.Error(w, "could not start onboarding", http.StatusInternalServerError)
		return
	}
	defer func() {
		_ = tx.Rollback(r.Context())
	}()

	var alreadyCompleted bool
	var existingInterests []string
	err = tx.QueryRow(r.Context(), `
		select onboarding_completed_at is not null, onboarding_interests
		from users
		where id = $1
		for update
	`, claims.UserID).Scan(&alreadyCompleted, &existingInterests)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "could not load onboarding state", http.StatusInternalServerError)
		return
	}

	if alreadyCompleted {
		if err := tx.Commit(r.Context()); err != nil {
			http.Error(w, "could not finish onboarding", http.StatusInternalServerError)
			return
		}
		if existingInterests == nil {
			existingInterests = []string{}
		}
		writeJSON(w, http.StatusOK, onboardingStatusResponse{
			Completed: true,
			Interests: existingInterests,
		})
		return
	}

	_, err = tx.Exec(r.Context(), `
		insert into user_preferences (user_id, default_currency)
		values ($1, $2)
		on conflict (user_id) do update
		set default_currency = excluded.default_currency,
		    updated_at = now()
	`, claims.UserID, request.DefaultCurrency)
	if err != nil {
		http.Error(w, "could not save onboarding preferences", http.StatusInternalServerError)
		return
	}

	for _, account := range request.Accounts {
		_, err = tx.Exec(r.Context(), `
			insert into accounts (
				user_id,
				name,
				account_type,
				account_class,
				currency,
				opening_balance
			)
			values ($1, $2, $3, 'asset', $4, $5)
		`, claims.UserID, account.Name, account.AccountType, request.DefaultCurrency, account.OpeningBalanceMinor)
		if err != nil {
			http.Error(w, "could not create onboarding accounts", http.StatusInternalServerError)
			return
		}
	}

	_, err = tx.Exec(r.Context(), `
		update users
		set onboarding_completed_at = now(),
		    onboarding_interests = $2,
		    updated_at = now()
		where id = $1
	`, claims.UserID, request.Interests)
	if err != nil {
		http.Error(w, "could not complete onboarding", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "could not finish onboarding", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, onboardingStatusResponse{
		Completed:       true,
		Interests:       request.Interests,
		AccountsCreated: len(request.Accounts),
	})
}
