package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/config"
	"github.com/dalitsokasonde/expense-tracker/api/internal/mail"
	"github.com/dalitsokasonde/expense-tracker/api/internal/plans"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

type Server struct {
	config           config.Config
	db               *pgxpool.Pool
	users            *store.UserStore
	userPreferences  *store.UserPreferenceStore
	accounts         *store.AccountStore
	categories       *store.CategoryStore
	incomeSources    *store.IncomeSourceStore
	businesses       *store.BusinessStore
	transactions     *store.TransactionStore
	imports          *store.ImportStore
	investmentTypes  *store.InvestmentTypeStore
	assets           *store.AssetStore
	assetValuations  *store.AssetValuationStore
	assetLots        *store.AssetLotStore
	loans            *store.LoanStore
	savingsGroups    *store.SavingsGroupStore
	savingsPockets   *store.SavingsPocketStore
	bonds            *store.BondStore
	unifiedDashboard *store.UnifiedDashboardStore
	idempotencyKeys  *store.IdempotencyKeyStore
	admin            *store.AdminStore
	feedback         *store.FeedbackStore
	authTokens       *store.AuthTokenStore
	loginPins        *store.LoginPINStore
	invitations      *store.InvitationStore
	emailDeliveries  *store.EmailDeliveryStore
	mailer           *mailer
	googleVerifier   *googleIdentityVerifier
	marketStocks     marketStockDirectoryCache
}

// New builds the server and its HTTP handler. Prefer NewServer when the caller
// also needs to start background work such as the digest scheduler.
func New(cfg config.Config, db *pgxpool.Pool) http.Handler {
	return NewServer(cfg, db).Handler()
}

func NewServer(cfg config.Config, db *pgxpool.Pool) *Server {
	bondStore := store.NewBondStore(db)
	deliveries := store.NewEmailDeliveryStore(db)
	s := &Server{
		config:           cfg,
		db:               db,
		users:            store.NewUserStore(db),
		userPreferences:  store.NewUserPreferenceStore(db),
		accounts:         store.NewAccountStore(db),
		categories:       store.NewCategoryStore(db),
		incomeSources:    store.NewIncomeSourceStore(db),
		businesses:       store.NewBusinessStore(db),
		transactions:     store.NewTransactionStore(db),
		imports:          store.NewImportStore(db),
		investmentTypes:  store.NewInvestmentTypeStore(db),
		assets:           store.NewAssetStore(db),
		assetValuations:  store.NewAssetValuationStore(db),
		assetLots:        store.NewAssetLotStore(db),
		loans:            store.NewLoanStore(db),
		savingsGroups:    store.NewSavingsGroupStore(db),
		savingsPockets:   store.NewSavingsPocketStore(db),
		bonds:            bondStore,
		unifiedDashboard: store.NewUnifiedDashboardStore(db, bondStore),
		idempotencyKeys:  store.NewIdempotencyKeyStore(db),
		admin:            store.NewAdminStore(db),
		feedback:         store.NewFeedbackStore(db),
		authTokens:       store.NewAuthTokenStore(db),
		loginPins:        store.NewLoginPINStore(db),
		invitations:      store.NewInvitationStore(db),
		emailDeliveries:  deliveries,
		googleVerifier:   newGoogleIdentityVerifier(),
	}

	s.mailer = &mailer{
		sender:     newMailSender(cfg),
		deliveries: deliveries,
		publicURL:  cfg.AppPublicURL,
	}

	return s
}

// newMailSender falls back to logging rather than failing to start. A relay
// that is misconfigured or not yet provisioned must not take the whole API
// down; everything except email keeps working, and the log says what was
// dropped.
func newMailSender(cfg config.Config) mail.Sender {
	if !cfg.MailEnabled() {
		log.Print("mail: SMTP_HOST is not set, outgoing email will be logged instead of sent")
		return mail.LogSender{}
	}

	sender, err := mail.NewSMTPSender(
		cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword,
		cfg.MailFromAddress, cfg.MailFromName, cfg.MailReplyTo,
	)
	if err != nil {
		log.Printf("mail: %v; outgoing email will be logged instead of sent", err)
		return mail.LogSender{}
	}
	return sender
}

func (s *Server) Handler() http.Handler {
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(limitRequestBody(s.config.MaxBodyBytes))
	router.Use(cors(s.config.AppOrigins))

	s.registerRoutes(router)
	router.Route("/api", s.registerRoutes)

	return router
}

func (s *Server) registerRoutes(router chi.Router) {
	authLimiter := newAuthRateLimiter(10, 5*time.Minute)
	registerLimiter := newAuthRateLimiter(5, 15*time.Minute)

	router.Get("/healthz", s.healthz)
	router.Get("/v1/setup/status", s.setupStatus)
	router.With(authLimiter.middleware).Post("/v1/auth/login", s.login)
	router.With(registerLimiter.middleware).Post("/v1/auth/register", s.register)
	router.With(registerLimiter.middleware).Post("/v1/auth/pin/request", s.requestLoginPIN)
	router.With(authLimiter.middleware).Post("/v1/auth/pin/verify", s.verifyLoginPIN)
	router.With(authLimiter.middleware).Post("/v1/auth/google", s.googleLogin)
	// Rate limited like login: both accept an unauthenticated email address and
	// would otherwise be a way to mail somebody repeatedly.
	router.With(registerLimiter.middleware).Post("/v1/auth/forgot-password", s.forgotPassword)
	router.With(authLimiter.middleware).Post("/v1/auth/reset-password", s.resetPassword)
	router.With(authLimiter.middleware).Post("/v1/auth/verify-email", s.verifyEmail)
	router.Get("/v1/auth/invitations", s.previewInvitation)
	router.With(registerLimiter.middleware).Post("/v1/auth/invitations/accept", s.acceptInvitation)

	router.Group(func(protected chi.Router) {
		protected.Use(auth.Middleware(s.config.JWTSecret, s.config.CookieName))
		protected.Use(s.requireCurrentUser)
		protected.Use(auth.SystemAdminBoundary)
		protected.Get("/v1/auth/me", s.me)
		protected.With(authLimiter.middleware).Post("/v1/auth/refresh", s.refreshToken)
		protected.With(authLimiter.middleware).Post("/v1/auth/logout", s.logout)
		protected.With(auth.RequireRole("system_admin")).Get("/v1/admin/users", s.listAdminUsers)
		protected.With(auth.RequireRole("system_admin")).Post("/v1/admin/system-admins", s.createSystemAdmin)
		protected.With(auth.RequireRole("system_admin")).Patch("/v1/admin/users/{id}/status", s.updateAdminUserStatus)
		protected.With(auth.RequireRole("system_admin")).Get("/v1/admin/audit", s.listAdminAudit)
		protected.With(auth.RequireRole("system_admin")).Get("/v1/admin/backups", s.listAdminBackups)
		protected.With(auth.RequireRole("system_admin")).Post("/v1/admin/backups", s.createAdminBackup)
		protected.With(auth.RequireRole("system_admin")).Get("/v1/admin/invitations", s.listInvitations)
		protected.With(auth.RequireRole("system_admin")).Post("/v1/admin/invitations", s.createInvitation)
		protected.With(auth.RequireRole("system_admin")).Delete("/v1/admin/invitations/{id}", s.revokeInvitation)
		protected.With(auth.RequireRole("system_admin")).Patch("/v1/admin/users/{id}/plan", s.updateAdminUserPlan)
		protected.Get("/v1/user/plan", s.getUserPlan)
		protected.With(auth.RequireRole("system_admin")).Get("/v1/admin/feedback", s.listAdminFeedback)
		protected.With(auth.RequireRole("system_admin")).Patch("/v1/admin/feedback/{id}/status", s.updateAdminFeedbackStatus)
		protected.Post("/v1/feedback", s.createFeedback)
		protected.Get("/v1/onboarding/status", s.getOnboardingStatus)
		protected.Post("/v1/onboarding/complete", s.completeOnboarding)
		protected.Get("/v1/user/preferences", s.getUserPreferences)
		protected.Patch("/v1/user/preferences", s.updateUserPreferences)
		protected.Get("/v1/notifications/types", s.listNotificationTypes)
		protected.Post("/v1/user/email/verify", s.sendVerificationEmail)
		protected.Get("/v1/user/emails", s.listEmailDeliveries)
		protected.Post("/v1/reports/email", s.emailReport)

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
		protected.Get("/v1/dashboard/unified", s.unifiedDashboardSummary)
		protected.Get("/v1/dashboard/insights", s.insightSummary)
		protected.Get("/v1/notifications", s.notifications)
		protected.Get("/v1/dashboard/annual", s.annualOverall)
		protected.Get("/v1/dashboard/categories", s.categorySpending)

		// Loans
		protected.Get("/v1/loans", s.listLoans)
		protected.Post("/v1/loans", s.createLoan)
		protected.Get("/v1/loans/{id}", s.getLoan)
		protected.Patch("/v1/loans/{id}", s.updateLoan)
		protected.Post("/v1/loans/borrowed", s.recordBorrowedMoney)
		protected.Post("/v1/loans/{id}/repayments", s.recordLoanRepayment)

		// Savings groups
		protected.Get("/v1/savings-groups", s.listSavingsGroups)
		protected.Post("/v1/savings-groups", s.createSavingsGroup)
		protected.Patch("/v1/savings-groups/{id}", s.updateSavingsGroup)
		protected.Delete("/v1/savings-groups/{id}", s.deleteSavingsGroup)
		protected.Post("/v1/savings-groups/{id}/shareout", s.closeSavingsGroupCycle)
		protected.Get("/v1/savings-pockets", s.listSavingsPockets)
		protected.Post("/v1/savings-pockets", s.createSavingsPocket)
		protected.Post("/v1/savings-pockets/{id}/interest", s.recordSavingsPocketInterest)

		// Imports
		protected.Post("/v1/imports/excel", s.uploadExcel)
		protected.Get("/v1/imports", s.listImports)
		protected.Get("/v1/imports/{id}", s.getImport)
		protected.Get("/v1/imports/{id}/preview", s.previewImport)
		protected.Post("/v1/imports/{id}/mappings", s.updateMappings)
		protected.Post("/v1/imports/{id}/confirm", s.confirmImport)
		protected.Post("/v1/imports/{id}/undo", s.undoImport)

		// Investment Types
		protected.Get("/v1/investment-types", s.listInvestmentTypes)
		protected.Post("/v1/investment-types", s.createInvestmentType)
		protected.Patch("/v1/investment-types/{id}", s.updateInvestmentType)
		protected.Delete("/v1/investment-types/{id}", s.deleteInvestmentType)

		// Assets
		protected.Get("/v1/assets", s.listAssets)
		protected.Post("/v1/assets", s.createAsset)
		protected.Patch("/v1/assets/{id}", s.updateAsset)
		protected.Delete("/v1/assets/{id}", s.deleteAsset)
		protected.Post("/v1/assets/{id}/valuations", s.upsertAssetValuation)
		protected.Get("/v1/assets/{id}/holding", s.getAssetHolding)
		protected.Post("/v1/assets/{id}/sell", s.sellAssetFIFO)
		protected.Post("/v1/assets/{id}/dividends", s.recordAssetDividend)
		protected.Get("/v1/market-data/luse", s.listLuSEStocks)
		protected.Get("/v1/market-data/luse/{ticker}", s.getLuSEQuote)

		// Investments
		protected.Get("/v1/investments/holdings", s.getHoldings)
		protected.Get("/v1/investments/summary", s.getInvestmentSummary)
		protected.Get("/v1/investments/dividends/summary", s.summarizeDividends)
		protected.Get("/v1/bonds", s.listBonds)
		// Registered before the {assetId} routes so "summary" is never read as
		// an asset id.
		protected.Get("/v1/bonds/summary", s.summarizeBonds)
		protected.Post("/v1/bonds", s.createBond)
		protected.Post("/v1/bonds/{assetId}/purchases", s.addBondPurchase)
		protected.Get("/v1/bonds/{assetId}/projection", s.getBondProjection)
		protected.Post("/v1/bonds/{assetId}/cashflows/{cashflowId}/confirm", s.confirmBondCoupon)

		// Sync
		protected.Get("/v1/sync/status", s.syncStatus)
	})
}

func (s *Server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"version": s.config.AppVersion,
	})
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
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
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

	s.completeLogin(w, r, user)
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

// refreshToken issues a fresh access token for the currently authenticated user.
// The caller must present a still-valid token; this lets the frontend renew the
// short-lived access token before it expires, avoiding "invalid token" errors when
// the NextAuth session outlives the API token.
func (s *Server) refreshToken(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "missing auth claims", http.StatusUnauthorized)
		return
	}

	token, err := auth.IssueToken(s.config.JWTSecret, claims.UserID, claims.Role)
	if err != nil {
		http.Error(w, "could not issue token", http.StatusInternalServerError)
		return
	}

	setAuthCookie(w, s.config, token)
	writeJSON(w, http.StatusOK, map[string]any{
		"accessToken": token,
	})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	clearAuthCookie(w, s.config)
	w.WriteHeader(http.StatusNoContent)
}

type registerRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var request registerRequest
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	email := strings.TrimSpace(strings.ToLower(request.Email))
	displayName := strings.TrimSpace(request.DisplayName)
	password := request.Password

	if email == "" || password == "" || displayName == "" {
		http.Error(w, "email, password, and displayName are required", http.StatusBadRequest)
		return
	}
	if err := auth.ValidatePassword(password); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
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

	// A new account opens on a short premium trial so someone can see what the
	// paid tier actually does before deciding. It lapses to free, never locks.
	user, err := s.users.CreateUser(r.Context(), store.NewUser{
		Email:         email,
		PasswordHash:  hash,
		DisplayName:   displayName,
		Plan:          plans.Premium,
		PlanExpiresAt: plans.TrialExpiry(plans.SignupTrialMonths, time.Now()),
		PlanSource:    plans.SourceSignup,
	})
	if err != nil {
		http.Error(w, "could not create user", http.StatusInternalServerError)
		return
	}

	token, err := auth.IssueToken(s.config.JWTSecret, user.ID, user.Role)
	if err != nil {
		http.Error(w, "could not issue token", http.StatusInternalServerError)
		return
	}

	setAuthCookie(w, s.config, token)
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

func cors(origins []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" {
				if !slices.Contains(origins, origin) {
					if r.Method == http.MethodOptions {
						http.Error(w, "origin not allowed", http.StatusForbidden)
						return
					}
					next.ServeHTTP(w, r)
					return
				}

				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}

			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
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
