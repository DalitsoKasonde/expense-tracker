package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Transaction struct {
	ID                   string   `json:"id"`
	UserID               string   `json:"userId"`
	TransactionDate      string   `json:"transactionDate"`
	EntryKind            string   `json:"entryKind"` // income, expense, transfers, lending, investments, and debt movements
	Amount               int64    `json:"amount"`    // in cents
	Currency             string   `json:"currency"`
	AccountID            string   `json:"accountId,omitempty"`
	DestinationAccountID *string  `json:"destinationAccountId"`
	CategoryID           *string  `json:"categoryId"`
	CategoryName         *string  `json:"categoryName,omitempty"`
	IncomeSourceID       *string  `json:"incomeSourceId"`
	BusinessID           *string  `json:"businessId"`
	AssetID              *string  `json:"assetId"`
	LoanID               *string  `json:"loanId"`
	Quantity             *float64 `json:"quantity"`
	UnitPrice            *int64   `json:"unitPrice"`
	Fees                 *int64   `json:"fees"`
	Note                 *string  `json:"note"`
	Source               string   `json:"source"` // manual, import, adjustment
	ImportID             *string  `json:"importId"`
	OriginEventID        *string  `json:"originEventId"`
	OriginEventType      *string  `json:"originEventType"`
	DeletedAt            *string  `json:"deletedAt"`
	CreatedAt            string   `json:"createdAt"`
	UpdatedAt            string   `json:"updatedAt"`
}

type TransactionStore struct {
	db *pgxpool.Pool
}

func NewTransactionStore(db *pgxpool.Pool) *TransactionStore {
	return &TransactionStore{db: db}
}

func (s *TransactionStore) ListByUser(ctx context.Context, userID string, limit, offset int) ([]Transaction, error) {
	rows, err := s.db.Query(ctx, `
		select t.id, t.user_id, t.transaction_date::text, t.entry_kind, t.amount::bigint, t.currency, t.account_id, t.destination_account_id, t.category_id,
		       income_source_id, business_id, asset_id, loan_id, quantity, unit_price::bigint, fees::bigint, note, source, import_id,
		       origin_event_id::text, origin_event_type, deleted_at::text, t.created_at::text, t.updated_at::text, c.name
		from transactions t
		left join categories c on c.id = t.category_id and c.user_id = t.user_id
		where t.user_id = $1 and t.deleted_at is null
		  -- Borrowing is stored as a cash receipt plus a matching liability
		  -- increase. The latter is an internal accounting counterpart, not a
		  -- second user activity. Keep it in the ledger for balances, but omit it
		  -- from the user-facing activity feed before limit/offset are applied.
		  and not exists (
			select 1
			from loans l
			where l.id = t.loan_id
			  and l.user_id = t.user_id
			  and t.origin_event_type = 'borrowed_money'
			  and t.entry_kind = 'income_borrowed'
			  and t.account_id = l.liability_account_id
		  )
		order by t.transaction_date desc, t.created_at desc
		limit $2 offset $3
	`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []Transaction
	for rows.Next() {
		var t Transaction
		var accountID *string
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.TransactionDate, &t.EntryKind, &t.Amount, &t.Currency,
			&accountID, &t.DestinationAccountID, &t.CategoryID, &t.IncomeSourceID, &t.BusinessID, &t.AssetID, &t.LoanID,
			&t.Quantity, &t.UnitPrice, &t.Fees, &t.Note, &t.Source, &t.ImportID,
			&t.OriginEventID, &t.OriginEventType, &t.DeletedAt, &t.CreatedAt, &t.UpdatedAt, &t.CategoryName,
		); err != nil {
			return nil, err
		}
		if accountID != nil {
			t.AccountID = *accountID
		}
		transactions = append(transactions, t)
	}

	return transactions, rows.Err()
}

func (s *TransactionStore) GetByID(ctx context.Context, id, userID string) (Transaction, error) {
	var result Transaction
	var accountID *string
	err := s.db.QueryRow(ctx, `
		select t.id, t.user_id, t.transaction_date::text, t.entry_kind, t.amount::bigint, t.currency, t.account_id, t.destination_account_id, t.category_id,
		       t.income_source_id, t.business_id, t.asset_id, t.loan_id, t.quantity, t.unit_price::bigint, t.fees::bigint, t.note, t.source, t.import_id,
		       t.origin_event_id::text, t.origin_event_type, t.deleted_at::text, t.created_at::text, t.updated_at::text, c.name
		from transactions t
		left join categories c on c.id = t.category_id and c.user_id = t.user_id
		where t.id = $1 and t.user_id = $2 and t.deleted_at is null
	`, id, userID).Scan(
		&result.ID, &result.UserID, &result.TransactionDate, &result.EntryKind, &result.Amount, &result.Currency,
		&accountID, &result.DestinationAccountID, &result.CategoryID, &result.IncomeSourceID, &result.BusinessID, &result.AssetID, &result.LoanID,
		&result.Quantity, &result.UnitPrice, &result.Fees, &result.Note, &result.Source, &result.ImportID,
		&result.OriginEventID, &result.OriginEventType, &result.DeletedAt, &result.CreatedAt, &result.UpdatedAt, &result.CategoryName,
	)
	if accountID != nil {
		result.AccountID = *accountID
	}
	return result, normalizeWriteError(err)
}

func (s *TransactionStore) Create(ctx context.Context, tx Transaction) (Transaction, error) {
	return createTransaction(ctx, s.db, tx)
}

func (s *TransactionStore) CreateWithTx(ctx context.Context, dbTx pgx.Tx, tx Transaction) (Transaction, error) {
	return createTransaction(ctx, dbTx, tx)
}

// CreateMovementFeeWithTx records a movement's service charge as its own
// categorized expense. Keeping it separate preserves the principal movement
// amount and lets transfers credit the full amount to their destination.
func (s *TransactionStore) CreateMovementFeeWithTx(ctx context.Context, dbTx pgx.Tx, movement Transaction, accountID string, feeMinor int64) (Transaction, error) {
	categoryID, err := ensureTransactionFeeCategory(ctx, dbTx, movement.UserID)
	if err != nil {
		return Transaction{}, err
	}

	note := "Transaction fee"
	if movement.Note != nil && *movement.Note != "" {
		note += " - " + *movement.Note
	}
	feeOriginType := "transaction_fee"
	return createTransaction(ctx, dbTx, Transaction{
		UserID:          movement.UserID,
		TransactionDate: movement.TransactionDate,
		EntryKind:       "expense_living",
		Amount:          feeMinor,
		Currency:        movement.Currency,
		AccountID:       accountID,
		CategoryID:      &categoryID,
		Note:            &note,
		Source:          movement.Source,
		OriginEventID:   movement.OriginEventID,
		OriginEventType: &feeOriginType,
	})
}

type transactionRowQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func createTransaction(ctx context.Context, db transactionRowQuerier, tx Transaction) (Transaction, error) {
	fees := int64(0)
	if tx.Fees != nil {
		fees = *tx.Fees
	}

	note := ""
	if tx.Note != nil {
		note = *tx.Note
	}

	var result Transaction
	var accountID *string
	err := db.QueryRow(ctx, `
		insert into transactions (
			user_id, transaction_date, entry_kind, amount, currency, account_id, destination_account_id, category_id,
			income_source_id, business_id, asset_id, loan_id, quantity, unit_price, fees, note, source, import_id,
			origin_event_id, origin_event_type
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
		returning id, user_id, transaction_date::text, entry_kind, amount::bigint, currency, account_id, destination_account_id, category_id,
		          income_source_id, business_id, asset_id, loan_id, quantity, unit_price::bigint, fees::bigint, note, source, import_id,
		          origin_event_id::text, origin_event_type, deleted_at::text, created_at::text, updated_at::text
		`, tx.UserID, tx.TransactionDate, tx.EntryKind, tx.Amount, tx.Currency, nullableAccountID(tx.AccountID), tx.DestinationAccountID, tx.CategoryID,
		tx.IncomeSourceID, tx.BusinessID, tx.AssetID, tx.LoanID, tx.Quantity, tx.UnitPrice, fees, note, tx.Source, tx.ImportID,
		tx.OriginEventID, tx.OriginEventType,
	).Scan(
		&result.ID, &result.UserID, &result.TransactionDate, &result.EntryKind, &result.Amount, &result.Currency,
		&accountID, &result.DestinationAccountID, &result.CategoryID, &result.IncomeSourceID, &result.BusinessID, &result.AssetID, &result.LoanID,
		&result.Quantity, &result.UnitPrice, &result.Fees, &result.Note, &result.Source, &result.ImportID,
		&result.OriginEventID, &result.OriginEventType, &result.DeletedAt, &result.CreatedAt, &result.UpdatedAt,
	)
	if accountID != nil {
		result.AccountID = *accountID
	}
	return result, err
}

func nullableAccountID(accountID string) any {
	if accountID == "" {
		return nil
	}
	return accountID
}

func (s *TransactionStore) Update(ctx context.Context, id, userID string, tx Transaction) (Transaction, error) {
	return updateTransaction(ctx, s.db, id, userID, tx)
}

func (s *TransactionStore) UpdateWithTx(ctx context.Context, dbTx pgx.Tx, id, userID string, tx Transaction) (Transaction, error) {
	return updateTransaction(ctx, dbTx, id, userID, tx)
}

func updateTransaction(ctx context.Context, db transactionRowQuerier, id, userID string, tx Transaction) (Transaction, error) {
	note := ""
	if tx.Note != nil {
		note = *tx.Note
	}

	var result Transaction
	var accountID *string
	err := db.QueryRow(ctx, `
		update transactions
		set transaction_date = $1, entry_kind = $2, amount = $3, account_id = $4, destination_account_id = $5, category_id = $6,
		    income_source_id = $7, business_id = $8, note = $9, updated_at = now()
		where id = $10 and user_id = $11 and deleted_at is null
		returning id, user_id, transaction_date::text, entry_kind, amount::bigint, currency, account_id, destination_account_id, category_id,
		          income_source_id, business_id, asset_id, loan_id, quantity, unit_price::bigint, fees::bigint, note, source, import_id,
		          origin_event_id::text, origin_event_type, deleted_at::text, created_at::text, updated_at::text
		`, tx.TransactionDate, tx.EntryKind, tx.Amount, nullableAccountID(tx.AccountID), tx.DestinationAccountID, tx.CategoryID, tx.IncomeSourceID, tx.BusinessID, note, id, userID,
	).Scan(
		&result.ID, &result.UserID, &result.TransactionDate, &result.EntryKind, &result.Amount, &result.Currency,
		&accountID, &result.DestinationAccountID, &result.CategoryID, &result.IncomeSourceID, &result.BusinessID, &result.AssetID, &result.LoanID,
		&result.Quantity, &result.UnitPrice, &result.Fees, &result.Note, &result.Source, &result.ImportID,
		&result.OriginEventID, &result.OriginEventType, &result.DeletedAt, &result.CreatedAt, &result.UpdatedAt,
	)
	if accountID != nil {
		result.AccountID = *accountID
	}
	return result, normalizeWriteError(err)
}

// SoftDelete marks a transaction as deleted
func (s *TransactionStore) SoftDelete(ctx context.Context, id, userID string) error {
	_, err := s.db.Exec(ctx, `
		update transactions
		set deleted_at = now(), updated_at = now()
		where id = $1 and user_id = $2 and deleted_at is null
	`, id, userID)
	return err
}

// DashboardSummary returns totals for the current period
func (s *TransactionStore) DashboardSummary(ctx context.Context, userID string, currency string) (map[string]interface{}, error) {
	var income, expense, saving, investment int64
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	err := s.db.QueryRow(ctx, `
		select
			coalesce(sum(case when entry_kind = 'income_earned' then amount else 0 end), 0)::bigint as income,
			coalesce(sum(case when entry_kind in ('expense_living', 'expense_interest', 'expense_fee') then amount else 0 end), 0)::bigint as expense,
			coalesce(sum(case when entry_kind = 'saving_transfer' then amount else 0 end), 0)::bigint as saving,
			coalesce(sum(case when entry_kind in ('investment_buy', 'investment_income') then amount else 0 end), 0)::bigint as investment
		from transactions
		where user_id = $1 and currency = $2 and deleted_at is null
		  and transaction_date >= $3
	`, userID, currency, monthStart.Format("2006-01-02"),
	).Scan(&income, &expense, &saving, &investment)

	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	return map[string]interface{}{
		"income":      income,
		"expense":     expense,
		"saving":      saving,
		"investment":  investment,
		"netCashFlow": income - expense,
	}, nil
}
