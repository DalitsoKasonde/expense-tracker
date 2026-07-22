package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
	"github.com/go-chi/chi/v5"
)

// Accounts

func (s *Server) listAccounts(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	accounts, err := s.accounts.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list accounts", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, accounts)
}

func (s *Server) createAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name                string `json:"name"`
		AccountType         string `json:"accountType"`
		AccountClass        string `json:"accountClass"`
		Currency            string `json:"currency"`
		OpeningBalanceMinor int64  `json:"openingBalanceMinor"`
	}
	if err := decodeJSON(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	name, err := normalizeRequiredName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	accountType, err := normalizeAllowedValue(req.AccountType, "cash", validAccountTypes, "accountType")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	accountClass, err := normalizeAllowedValue(req.AccountClass, "asset", validAccountClasses, "accountClass")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	account, err := s.accounts.Create(r.Context(), claims.UserID, name, accountType, accountClass, currency, req.OpeningBalanceMinor)
	if err != nil {
		writeSettingsError(w, err, "failed to create account")
		return
	}

	writeJSON(w, http.StatusCreated, account)
}

func (s *Server) updateAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		Name         string `json:"name"`
		AccountType  string `json:"accountType"`
		AccountClass string `json:"accountClass"`
		Currency     string `json:"currency"`
	}
	if err := decodeJSON(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	name, err := normalizeRequiredName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	accountType, err := normalizeAllowedValue(req.AccountType, "cash", validAccountTypes, "accountType")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	accountClass, err := normalizeAllowedValue(req.AccountClass, "asset", validAccountClasses, "accountClass")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	account, err := s.accounts.Update(r.Context(), id, claims.UserID, name, accountType, accountClass, currency)
	if err != nil {
		writeSettingsError(w, err, "failed to update account")
		return
	}

	writeJSON(w, http.StatusOK, account)
}

func (s *Server) deleteAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.accounts.Delete(r.Context(), id, claims.UserID); err != nil {
		writeSettingsError(w, err, "failed to delete account")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Categories

func (s *Server) listCategories(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	categories, err := s.categories.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list categories", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, categories)
}

func (s *Server) createCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name          string  `json:"name"`
		CategoryGroup string  `json:"categoryGroup"`
		ParentID      *string `json:"parentId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	name, err := normalizeRequiredName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	categoryGroup, err := normalizeAllowedValue(req.CategoryGroup, "expense", validCategoryGroups, "categoryGroup")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.ParentID != nil {
		trimmed := strings.TrimSpace(*req.ParentID)
		if trimmed == "" {
			req.ParentID = nil
		} else {
			req.ParentID = &trimmed
		}
	}

	category, err := s.categories.Create(r.Context(), claims.UserID, name, categoryGroup, req.ParentID)
	if err != nil {
		writeSettingsError(w, err, "failed to create category")
		return
	}

	writeJSON(w, http.StatusCreated, category)
}

func (s *Server) updateCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		Name          string  `json:"name"`
		CategoryGroup string  `json:"categoryGroup"`
		ParentID      *string `json:"parentId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	name, err := normalizeRequiredName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	categoryGroup, err := normalizeAllowedValue(req.CategoryGroup, "expense", validCategoryGroups, "categoryGroup")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.ParentID != nil {
		trimmed := strings.TrimSpace(*req.ParentID)
		if trimmed == "" {
			req.ParentID = nil
		} else {
			req.ParentID = &trimmed
		}
	}

	category, err := s.categories.Update(r.Context(), id, claims.UserID, name, categoryGroup, req.ParentID)
	if err != nil {
		writeSettingsError(w, err, "failed to update category")
		return
	}

	writeJSON(w, http.StatusOK, category)
}

func (s *Server) deleteCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.categories.Delete(r.Context(), id, claims.UserID); err != nil {
		writeSettingsError(w, err, "failed to delete category")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Income Sources

func (s *Server) listIncomeSources(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	sources, err := s.incomeSources.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list income sources", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, sources)
}

func (s *Server) createIncomeSource(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name       string `json:"name"`
		SourceType string `json:"sourceType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	name, err := normalizeRequiredName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	sourceType, err := normalizeAllowedValue(req.SourceType, "other", validIncomeSourceTypes, "sourceType")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	source, err := s.incomeSources.Create(r.Context(), claims.UserID, name, sourceType)
	if err != nil {
		writeSettingsError(w, err, "failed to create income source")
		return
	}

	writeJSON(w, http.StatusCreated, source)
}

func (s *Server) updateIncomeSource(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		Name       string `json:"name"`
		SourceType string `json:"sourceType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	name, err := normalizeRequiredName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	sourceType, err := normalizeAllowedValue(req.SourceType, "other", validIncomeSourceTypes, "sourceType")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	source, err := s.incomeSources.Update(r.Context(), id, claims.UserID, name, sourceType)
	if err != nil {
		writeSettingsError(w, err, "failed to update income source")
		return
	}

	writeJSON(w, http.StatusOK, source)
}

func (s *Server) deleteIncomeSource(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.incomeSources.Delete(r.Context(), id, claims.UserID); err != nil {
		writeSettingsError(w, err, "failed to delete income source")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Businesses

func (s *Server) listBusinesses(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	businesses, err := s.businesses.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list businesses", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, businesses)
}

func (s *Server) createBusiness(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	name, err := normalizeRequiredName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	business, err := s.businesses.Create(r.Context(), claims.UserID, name)
	if err != nil {
		writeSettingsError(w, err, "failed to create business")
		return
	}

	writeJSON(w, http.StatusCreated, business)
}

func (s *Server) updateBusiness(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	name, err := normalizeRequiredName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	business, err := s.businesses.Update(r.Context(), id, claims.UserID, name)
	if err != nil {
		writeSettingsError(w, err, "failed to update business")
		return
	}

	writeJSON(w, http.StatusOK, business)
}

func (s *Server) deleteBusiness(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.businesses.Delete(r.Context(), id, claims.UserID); err != nil {
		writeSettingsError(w, err, "failed to delete business")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Transactions

func (s *Server) listTransactions(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	limit := 20
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		_, _ = fmt.Sscanf(l, "%d", &limit)
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		_, _ = fmt.Sscanf(o, "%d", &offset)
	}

	transactions, err := s.transactions.ListByUser(r.Context(), claims.UserID, limit, offset)
	if err != nil {
		http.Error(w, "failed to list transactions", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, transactions)
}

func (s *Server) createTransaction(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		TransactionDate      string   `json:"transactionDate"`
		EntryKind            string   `json:"entryKind"`
		Amount               int64    `json:"amount"`
		Currency             string   `json:"currency"`
		AccountID            string   `json:"accountId"`
		DestinationAccountID *string  `json:"destinationAccountId"`
		CategoryID           *string  `json:"categoryId"`
		IncomeSourceID       *string  `json:"incomeSourceId"`
		BusinessID           *string  `json:"businessId"`
		AssetID              *string  `json:"assetId"`
		LoanID               *string  `json:"loanId"`
		Quantity             *float64 `json:"quantity"`
		UnitPrice            *int64   `json:"unitPrice"`
		Fees                 *int64   `json:"fees"`
		Note                 *string  `json:"note"`
		Source               string   `json:"source"`
		ImportID             *string  `json:"importId"`
		ClientID             *string  `json:"clientId"` // For offline sync
		OriginEventID        *string  `json:"originEventId"`
		OriginEventType      *string  `json:"originEventType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	entryKind, err := normalizeAllowedValue(req.EntryKind, "", validTransactionEntryKinds, "entryKind")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Check idempotency
	idempotencyKey := r.Header.Get("X-Idempotency-Key")
	if idempotencyKey != "" {
		cached, err := s.idempotencyKeys.GetOrCreate(r.Context(), claims.UserID, idempotencyKey, req)
		if err != nil {
			http.Error(w, "idempotency key validation failed: "+err.Error(), http.StatusBadRequest)
			return
		}
		if cached != nil {
			// Return cached response
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			w.Write(cached.Response)
			return
		}
	}

	tx := store.Transaction{
		UserID:               claims.UserID,
		TransactionDate:      req.TransactionDate,
		EntryKind:            entryKind,
		Amount:               req.Amount,
		Currency:             currency,
		AccountID:            req.AccountID,
		DestinationAccountID: req.DestinationAccountID,
		CategoryID:           req.CategoryID,
		IncomeSourceID:       req.IncomeSourceID,
		BusinessID:           req.BusinessID,
		AssetID:              req.AssetID,
		LoanID:               req.LoanID,
		Quantity:             req.Quantity,
		UnitPrice:            req.UnitPrice,
		Fees:                 req.Fees,
		Note:                 req.Note,
		Source:               req.Source,
		ImportID:             req.ImportID,
		OriginEventID:        req.OriginEventID,
		OriginEventType:      req.OriginEventType,
	}

	result, err := s.transactions.Create(r.Context(), tx)
	if err != nil {
		http.Error(w, "failed to create transaction: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// If investment_buy, create asset_lot
	if entryKind == "investment_buy" && req.AssetID != nil && req.Quantity != nil && req.UnitPrice != nil {
		fees := int64(0)
		if req.Fees != nil {
			fees = *req.Fees
		}
		totalCost := int64(float64(*req.Quantity)*float64(*req.UnitPrice)) + fees

		lot := store.AssetLot{
			UserID:          claims.UserID,
			AssetID:         *req.AssetID,
			TransactionID:   &result.ID,
			Quantity:        *req.Quantity,
			UnitPrice:       *req.UnitPrice,
			Fees:            fees,
			TotalCost:       totalCost,
			AcquisitionDate: req.TransactionDate,
		}

		s.assetLots.Create(r.Context(), lot)
	}

	// Cache response if idempotency key provided
	if idempotencyKey != "" {
		respData, _ := json.Marshal(result)
		s.idempotencyKeys.Store(r.Context(), claims.UserID, idempotencyKey, req, respData)
	}

	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) updateTransaction(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		EntryKind            string  `json:"entryKind"`
		Amount               int64   `json:"amount"`
		AccountID            string  `json:"accountId"`
		DestinationAccountID *string `json:"destinationAccountId"`
		CategoryID           *string `json:"categoryId"`
		IncomeSourceID       *string `json:"incomeSourceId"`
		BusinessID           *string `json:"businessId"`
		Note                 *string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	entryKind, err := normalizeAllowedValue(req.EntryKind, "", validTransactionEntryKinds, "entryKind")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tx := store.Transaction{
		EntryKind:            entryKind,
		Amount:               req.Amount,
		AccountID:            req.AccountID,
		DestinationAccountID: req.DestinationAccountID,
		CategoryID:           req.CategoryID,
		IncomeSourceID:       req.IncomeSourceID,
		BusinessID:           req.BusinessID,
		Note:                 req.Note,
	}

	result, err := s.transactions.Update(r.Context(), id, claims.UserID, tx)
	if err != nil {
		http.Error(w, "failed to update transaction", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) deleteTransaction(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.transactions.SoftDelete(r.Context(), id, claims.UserID); err != nil {
		http.Error(w, "failed to delete transaction", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) dashboardSummary(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "ZMW"
	}

	dashboard, err := s.unifiedDashboard.Get(r.Context(), claims.UserID, currency, time.Now())
	if err != nil {
		http.Error(w, "failed to get summary", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"income":           dashboard.Income,
		"borrowed":         dashboard.Borrowed,
		"expense":          dashboard.Expense,
		"livingExpense":    dashboard.LivingExpense,
		"debtInterestFees": dashboard.DebtInterestFees,
		"debtPrincipal":    dashboard.DebtPrincipal,
		"saving":           dashboard.Saving,
		"investment":       dashboard.Investment,
		"operatingBalance": dashboard.OperatingBalance,
		"freeCashFlow":     dashboard.FreeCashFlow,
		"netCashFlow":      dashboard.NetCashFlow,
	})
}

// Imports

func (s *Server) uploadExcel(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if err := r.ParseMultipartForm(25 * 1024 * 1024); err != nil {
		http.Error(w, "failed to parse form", http.StatusBadRequest)
		return
	}

	accountID := strings.TrimSpace(r.FormValue("accountId"))
	newAccountName := strings.TrimSpace(r.FormValue("newAccountName"))
	newAccountCurrency := strings.TrimSpace(r.FormValue("newAccountCurrency"))

	accounts, err := s.accounts.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to load accounts", http.StatusInternalServerError)
		return
	}

	var selectedAccount *store.Account
	for _, account := range accounts {
		if account.ID == accountID {
			selectedAccount = &account
			break
		}
	}
	if selectedAccount == nil {
		if newAccountName == "" {
			http.Error(w, "choose an account or create one for import", http.StatusBadRequest)
			return
		}

		currency, err := normalizeCurrency(newAccountCurrency)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		accountName, err := normalizeRequiredName(newAccountName)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		createdAccount, err := s.accounts.Create(r.Context(), claims.UserID, accountName, "cash", "asset", currency, 0)
		if err != nil {
			writeSettingsError(w, err, "failed to create import account")
			return
		}
		selectedAccount = &createdAccount
	}

	fileHeaders := r.MultipartForm.File["files"]
	if len(fileHeaders) == 0 {
		fileHeaders = r.MultipartForm.File["file"]
	}
	if len(fileHeaders) == 0 {
		http.Error(w, "at least one workbook is required", http.StatusBadRequest)
		return
	}

	importLabel := "legacy workbook import"
	if len(fileHeaders) == 1 {
		importLabel = fileHeaders[0].Filename
	}
	imp, err := s.imports.Create(r.Context(), claims.UserID, importLabel)
	if err != nil {
		http.Error(w, "failed to create import", http.StatusInternalServerError)
		return
	}

	rowCount := 0
	for _, header := range fileHeaders {
		file, err := header.Open()
		if err != nil {
			msg := "failed to open workbook"
			_ = s.imports.UpdateStatus(r.Context(), imp.ID, claims.UserID, "failed", &msg)
			http.Error(w, msg, http.StatusBadRequest)
			return
		}

		payload, err := io.ReadAll(file)
		file.Close()
		if err != nil {
			msg := "failed to read workbook"
			_ = s.imports.UpdateStatus(r.Context(), imp.ID, claims.UserID, "failed", &msg)
			http.Error(w, msg, http.StatusBadRequest)
			return
		}

		entries, err := parseLegacyWorkbook(header.Filename, payload, selectedAccount.Currency, selectedAccount.ID)
		if err != nil {
			msg := err.Error()
			_ = s.imports.UpdateStatus(r.Context(), imp.ID, claims.UserID, "failed", &msg)
			http.Error(w, msg, http.StatusBadRequest)
			return
		}

		for _, entry := range entries {
			row, err := s.imports.CreateRow(r.Context(), imp.ID, entry.Raw.SheetName, entry.Raw.EntryIndex, marshalLegacyJSON(entry.Raw))
			if err != nil {
				msg := "failed to save import rows"
				_ = s.imports.UpdateStatus(r.Context(), imp.ID, claims.UserID, "failed", &msg)
				http.Error(w, msg, http.StatusInternalServerError)
				return
			}
			if err := s.imports.UpdateRowMapped(r.Context(), row.ID, marshalLegacyJSON(entry.Mapped), nil); err != nil {
				msg := "failed to map import rows"
				_ = s.imports.UpdateStatus(r.Context(), imp.ID, claims.UserID, "failed", &msg)
				http.Error(w, msg, http.StatusInternalServerError)
				return
			}
			rowCount++
		}
	}

	if rowCount == 0 {
		msg := "no importable rows were found"
		_ = s.imports.UpdateStatus(r.Context(), imp.ID, claims.UserID, "failed", &msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	if err := s.imports.UpdateStatus(r.Context(), imp.ID, claims.UserID, "ready_to_confirm", nil); err != nil {
		http.Error(w, "failed to update import status", http.StatusInternalServerError)
		return
	}

	imp, _ = s.imports.GetByID(r.Context(), imp.ID, claims.UserID)
	writeJSON(w, http.StatusCreated, imp)
}

func (s *Server) listImports(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	imports, err := s.imports.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list imports", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, imports)
}

func (s *Server) getImport(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	imp, err := s.imports.GetByID(r.Context(), id, claims.UserID)
	if err != nil {
		http.Error(w, "import not found", http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, imp)
}

func (s *Server) previewImport(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	imp, err := s.imports.GetByID(r.Context(), id, claims.UserID)
	if err != nil {
		http.Error(w, "import not found", http.StatusNotFound)
		return
	}

	// Get first 10 rows for preview
	rows, err := s.imports.GetRowsByImportID(r.Context(), id, 10, 0)
	if err != nil {
		http.Error(w, "failed to get preview", http.StatusInternalServerError)
		return
	}

	imp.Rows = rows
	writeJSON(w, http.StatusOK, imp)
}

func (s *Server) updateMappings(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		Mappings json.RawMessage `json:"mappings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if err := s.imports.UpdateMappings(r.Context(), id, claims.UserID, req.Mappings); err != nil {
		http.Error(w, "failed to update mappings", http.StatusInternalServerError)
		return
	}

	if err := s.imports.UpdateStatus(r.Context(), id, claims.UserID, "ready_to_confirm", nil); err != nil {
		http.Error(w, "failed to update status", http.StatusInternalServerError)
		return
	}

	imp, _ := s.imports.GetByID(r.Context(), id, claims.UserID)
	writeJSON(w, http.StatusOK, imp)
}

func (s *Server) confirmImport(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	imp, err := s.imports.GetByID(r.Context(), id, claims.UserID)
	if err != nil {
		http.Error(w, "import not found", http.StatusNotFound)
		return
	}

	if imp.Status != "ready_to_confirm" {
		http.Error(w, "import not ready to confirm", http.StatusBadRequest)
		return
	}

	// Get all rows and create transactions for each
	rows, err := s.imports.GetRows(r.Context(), id)
	if err != nil {
		http.Error(w, "failed to get rows", http.StatusInternalServerError)
		return
	}

	categories, err := s.categories.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to load categories", http.StatusInternalServerError)
		return
	}
	categoryIDsByName := make(map[string]string, len(categories))
	for _, category := range categories {
		categoryIDsByName[strings.ToLower(category.CategoryGroup)+"::"+strings.ToLower(strings.TrimSpace(category.Name))] = category.ID
	}

	incomeSources, err := s.incomeSources.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to load income sources", http.StatusInternalServerError)
		return
	}
	incomeSourceIDsByName := make(map[string]string, len(incomeSources))
	for _, source := range incomeSources {
		incomeSourceIDsByName[strings.ToLower(strings.TrimSpace(source.Name))] = source.ID
	}

	for _, row := range rows {
		if row.Mapped == nil {
			continue
		}

		var txData legacyMappedTransaction
		if err := json.Unmarshal(*row.Mapped, &txData); err != nil {
			continue
		}

		var categoryID *string
		if txData.CategoryName != nil && strings.TrimSpace(*txData.CategoryName) != "" {
			key := "expense::" + strings.ToLower(strings.TrimSpace(*txData.CategoryName))
			idValue, exists := categoryIDsByName[key]
			if !exists {
				category, err := s.categories.Create(r.Context(), claims.UserID, *txData.CategoryName, "expense", nil)
				if err != nil {
					continue
				}
				idValue = category.ID
				categoryIDsByName[key] = idValue
			}
			categoryID = &idValue
		}

		var incomeSourceID *string
		if txData.IncomeSourceName != nil && strings.TrimSpace(*txData.IncomeSourceName) != "" {
			key := strings.ToLower(strings.TrimSpace(*txData.IncomeSourceName))
			idValue, exists := incomeSourceIDsByName[key]
			if !exists {
				source, err := s.incomeSources.Create(r.Context(), claims.UserID, *txData.IncomeSourceName, inferIncomeSourceType(*txData.IncomeSourceName))
				if err != nil {
					continue
				}
				idValue = source.ID
				incomeSourceIDsByName[key] = idValue
			}
			incomeSourceID = &idValue
		}

		tx := store.Transaction{
			UserID:          claims.UserID,
			TransactionDate: txData.TransactionDate,
			EntryKind:       txData.EntryKind,
			Amount:          txData.Amount,
			Currency:        txData.Currency,
			AccountID:       txData.AccountID,
			CategoryID:      categoryID,
			IncomeSourceID:  incomeSourceID,
			Note:            txData.Note,
			Source:          "import",
			ImportID:        &id,
		}

		s.transactions.Create(r.Context(), tx)
	}

	if err := s.imports.UpdateStatus(r.Context(), id, claims.UserID, "confirmed", nil); err != nil {
		http.Error(w, "failed to confirm import", http.StatusInternalServerError)
		return
	}

	imp, _ = s.imports.GetByID(r.Context(), id, claims.UserID)
	writeJSON(w, http.StatusOK, imp)
}

func (s *Server) undoImport(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	imp, err := s.imports.GetByID(r.Context(), id, claims.UserID)
	if err != nil {
		http.Error(w, "import not found", http.StatusNotFound)
		return
	}

	if imp.Status != "confirmed" {
		http.Error(w, "only confirmed imports can be undone", http.StatusBadRequest)
		return
	}

	if _, err := s.db.Exec(r.Context(), `
		update transactions
		set deleted_at = now(), updated_at = now()
		where user_id = $1 and import_id = $2 and deleted_at is null
	`, claims.UserID, id); err != nil {
		http.Error(w, "failed to undo imported transactions", http.StatusInternalServerError)
		return
	}

	if err := s.imports.UpdateStatus(r.Context(), id, claims.UserID, "undone", nil); err != nil {
		http.Error(w, "failed to undo import", http.StatusInternalServerError)
		return
	}

	imp, _ = s.imports.GetByID(r.Context(), id, claims.UserID)
	writeJSON(w, http.StatusOK, imp)
}

// Investment Types

func (s *Server) listInvestmentTypes(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	types, err := s.investmentTypes.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list investment types", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, types)
}

func (s *Server) createInvestmentType(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	invType, err := s.investmentTypes.Create(r.Context(), claims.UserID, req.Name)
	if err != nil {
		http.Error(w, "failed to create investment type", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, invType)
}

func (s *Server) updateInvestmentType(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	invType, err := s.investmentTypes.Update(r.Context(), id, claims.UserID, req.Name)
	if err != nil {
		http.Error(w, "failed to update investment type", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, invType)
}

func (s *Server) deleteInvestmentType(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.investmentTypes.Delete(r.Context(), id, claims.UserID); err != nil {
		http.Error(w, "failed to delete investment type", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Assets

func (s *Server) listAssets(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	assets, err := s.assets.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list assets", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, assets)
}

func (s *Server) createAsset(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		InvestmentTypeID string  `json:"investmentTypeId"`
		AssetClass       string  `json:"assetClass"`
		Name             string  `json:"name"`
		Symbol           *string `json:"symbol"`
		Currency         string  `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	name, err := normalizeRequiredName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	assetClass, err := normalizeAllowedValue(req.AssetClass, "other", validAssetClasses, "assetClass")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	asset, err := s.assets.Create(r.Context(), claims.UserID, req.InvestmentTypeID, assetClass, name, currency, req.Symbol)
	if err != nil {
		http.Error(w, "failed to create asset", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, asset)
}

func (s *Server) updateAsset(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		AssetClass string  `json:"assetClass"`
		Name       string  `json:"name"`
		Symbol     *string `json:"symbol"`
		Currency   string  `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	name, err := normalizeRequiredName(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	assetClass, err := normalizeAllowedValue(req.AssetClass, "other", validAssetClasses, "assetClass")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	asset, err := s.assets.Update(r.Context(), id, claims.UserID, assetClass, name, currency, req.Symbol)
	if err != nil {
		http.Error(w, "failed to update asset", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, asset)
}

func (s *Server) deleteAsset(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.assets.Delete(r.Context(), id, claims.UserID); err != nil {
		http.Error(w, "failed to delete asset", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Investments

func (s *Server) getHoldings(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	holdings, err := s.assetLots.ListAllHoldings(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to get holdings", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, holdings)
}

func (s *Server) getInvestmentSummary(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get all investment types for user
	types, err := s.investmentTypes.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to get investment types", http.StatusInternalServerError)
		return
	}

	// For each type, get assets and calculate totals
	summary := make([]map[string]interface{}, 0)
	for _, invType := range types {
		assets, _ := s.assets.ListByInvestmentType(r.Context(), claims.UserID, invType.ID)

		// Calculate total invested and total value for this type
		totalInvested := int64(0)
		totalAssets := 0
		for _, asset := range assets {
			holding, _ := s.assetLots.GetHolding(r.Context(), claims.UserID, asset.ID)
			if holding != nil {
				if tc, ok := holding["totalCost"].(int64); ok {
					totalInvested += tc
				}
				totalAssets++
			}
		}

		summary = append(summary, map[string]interface{}{
			"type":          invType.Name,
			"typeId":        invType.ID,
			"assetCount":    len(assets),
			"totalInvested": totalInvested,
		})
	}

	writeJSON(w, http.StatusOK, summary)
}

// Sync

func (s *Server) syncStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	_ = claims // User is authenticated, used for permission check
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"synced":   true,
		"pending":  0,
		"lastSync": "now",
	})
}
