package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/config"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

type Server struct {
	config          config.Config
	users           *store.UserStore
	accounts        *store.AccountStore
	categories      *store.CategoryStore
	incomeSources   *store.IncomeSourceStore
	businesses      *store.BusinessStore
	transactions    *store.TransactionStore
}

func New(cfg config.Config, db *pgxpool.Pool) http.Handler {
	s := &Server{
		config:        cfg,
		users:         store.NewUserStore(db),
		accounts:      store.NewAccountStore(db),
		categories:    store.NewCategoryStore(db),
		incomeSources: store.NewIncomeSourceStore(db),
		businesses:    store.NewBusinessStore(db),
		transactions:  store.NewTransactionStore(db),
	}

	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(cors(cfg.AppOrigin))

	router.Get("/healthz", s.healthz)
	router.Get("/v1/setup/status", s.setupStatus)
	router.Post("/v1/auth/login", s.login)
	router.Post("/v1/auth/register", s.register)

	router.Group(func(protected chi.Router) {
		protected.Use(auth.Middleware(cfg.JWTSecret))
		protected.Get("/v1/auth/me", s.me)

		// Accounts
		protected.Get("/v1/accounts", s.listAccounts)
		protected.Post("/v1/accounts", s.createAccount)
		protected.Patch("/v1/accounts/{id}", s.updateAccount)
		protected.Delete("/v1/accounts/{id}", s.deleteAccount)

		// Categories
		protected.Get("/v1/categories", s.listCategories)
		protected.Post("/v1/categories", s.createCategory)
		protected.Patch("/v1/categories/{id}", s.updateCategory)
		protected.Delete("/v1/categories/{id}", s.deleteCategory)

		// Income Sources
		protected.Get("/v1/income-sources", s.listIncomeSources)
		protected.Post("/v1/income-sources", s.createIncomeSource)
		protected.Patch("/v1/income-sources/{id}", s.updateIncomeSource)
		protected.Delete("/v1/income-sources/{id}", s.deleteIncomeSource)

		// Businesses
		protected.Get("/v1/businesses", s.listBusinesses)
		protected.Post("/v1/businesses", s.createBusiness)
		protected.Patch("/v1/businesses/{id}", s.updateBusiness)
		protected.Delete("/v1/businesses/{id}", s.deleteBusiness)

		// Transactions
		protected.Get("/v1/transactions", s.listTransactions)
		protected.Post("/v1/transactions", s.createTransaction)
		protected.Patch("/v1/transactions/{id}", s.updateTransaction)
		protected.Delete("/v1/transactions/{id}", s.deleteTransaction)

		// Dashboard
		protected.Get("/v1/dashboard/summary", s.dashboardSummary)
	})

	return router
}

func (s *Server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) setupStatus(w http.ResponseWriter, r *http.Request) {
	count, err := s.users.CountUsers(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"databaseReady": false,
			"message":       err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"databaseReady":           true,
		"bootstrapEnvConfigured":  s.config.AdminBootstrapEmail != "" && s.config.AdminBootstrapPassword != "",
		"bootstrapAdminAvailable": count == 0,
		"userCount":               count,
	})
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var request loginRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	email := strings.TrimSpace(strings.ToLower(request.Email))
	password := request.Password
	if email == "" || password == "" {
		http.Error(w, "email and password are required", http.StatusBadRequest)
		return
	}

	count, err := s.users.CountUsers(r.Context())
	if err != nil {
		http.Error(w, "database unavailable", http.StatusServiceUnavailable)
		return
	}

	var user store.User

	if count == 0 && email == strings.ToLower(s.config.AdminBootstrapEmail) && password == s.config.AdminBootstrapPassword {
		hash, err := auth.HashPassword(password)
		if err != nil {
			http.Error(w, "could not hash bootstrap password", http.StatusInternalServerError)
			return
		}

		user, err = s.users.CreateBootstrapAdmin(r.Context(), email, hash)
		if err != nil {
			http.Error(w, "could not create bootstrap admin", http.StatusInternalServerError)
			return
		}
	} else {
		user, err = s.users.FindByEmail(r.Context(), email)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "invalid credentials", http.StatusUnauthorized)
				return
			}
			http.Error(w, "database unavailable", http.StatusServiceUnavailable)
			return
		}

		if !user.IsActive || auth.CheckPassword(user.PasswordHash, password) != nil {
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}
	}

	token, err := auth.IssueToken(s.config.JWTSecret, user.ID, user.Role)
	if err != nil {
		http.Error(w, "could not issue token", http.StatusInternalServerError)
		return
	}

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

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "missing auth claims", http.StatusUnauthorized)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"userId": claims.UserID,
		"role":   claims.Role,
	})
}

type registerRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var request registerRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	email := strings.TrimSpace(strings.ToLower(request.Email))
	displayName := strings.TrimSpace(request.DisplayName)
	password := request.Password

	if email == "" || password == "" || displayName == "" {
		http.Error(w, "email, password, and displayName are required", http.StatusBadRequest)
		return
	}

	// Check if email already exists
	_, err := s.users.FindByEmail(r.Context(), email)
	if err == nil {
		http.Error(w, "email already registered", http.StatusConflict)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "database unavailable", http.StatusServiceUnavailable)
		return
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		http.Error(w, "could not hash password", http.StatusInternalServerError)
		return
	}

	user, err := s.users.CreateInvitedUser(r.Context(), email, hash, displayName)
	if err != nil {
		http.Error(w, "could not create user", http.StatusInternalServerError)
		return
	}

	token, err := auth.IssueToken(s.config.JWTSecret, user.ID, user.Role)
	if err != nil {
		http.Error(w, "could not issue token", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"accessToken": token,
		"user": map[string]string{
			"id":          user.ID,
			"email":       user.Email,
			"displayName": user.DisplayName,
			"role":        user.Role,
		},
	})
}

func cors(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

