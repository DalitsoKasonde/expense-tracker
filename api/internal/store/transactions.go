package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Transaction struct {
	ID                   string   `json:"id"`
	UserID               string   `json:"userId"`
	TransactionDate      string   `json:"transactionDate"`
	EntryKind            string   `json:"entryKind"` // income, expense, saving_transfer, investment_buy, investment_income, bond_principal_redemption
	Amount               int64    `json:"amount"`    // in cents
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
		select id, user_id, transaction_date::text, entry_kind, amount::bigint, currency, account_id, destination_account_id, category_id,
		       income_source_id, business_id, asset_id, loan_id, quantity, unit_price::bigint, fees::bigint, note, source, import_id,
		       origin_event_id::text, origin_event_type, deleted_at::text, created_at::text, updated_at::text
		from transactions
		where user_id = $1 and deleted_at is null
		order by transaction_date desc
		limit $2 offset $3
	`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []Transaction
	for rows.Next() {
		var t Transaction
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.TransactionDate, &t.EntryKind, &t.Amount, &t.Currency,
			&t.AccountID, &t.DestinationAccountID, &t.CategoryID, &t.IncomeSourceID, &t.BusinessID, &t.AssetID, &t.LoanID,
			&t.Quantity, &t.UnitPrice, &t.Fees, &t.Note, &t.Source, &t.ImportID,
			&t.OriginEventID, &t.OriginEventType, &t.DeletedAt, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		transactions = append(transactions, t)
	}

	return transactions, rows.Err()
}

func (s *TransactionStore) Create(ctx context.Context, tx Transaction) (Transaction, error) {
	fees := int64(0)
	if tx.Fees != nil {
		fees = *tx.Fees
	}

	note := ""
	if tx.Note != nil {
		note = *tx.Note
	}

	var result Transaction
	err := s.db.QueryRow(ctx, `
		insert into transactions (
			user_id, transaction_date, entry_kind, amount, currency, account_id, destination_account_id, category_id,
			income_source_id, business_id, asset_id, loan_id, quantity, unit_price, fees, note, source, import_id,
			origin_event_id, origin_event_type
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
		returning id, user_id, transaction_date::text, entry_kind, amount::bigint, currency, account_id, destination_account_id, category_id,
		          income_source_id, business_id, asset_id, loan_id, quantity, unit_price::bigint, fees::bigint, note, source, import_id,
		          origin_event_id::text, origin_event_type, deleted_at::text, created_at::text, updated_at::text
		`, tx.UserID, tx.TransactionDate, tx.EntryKind, tx.Amount, tx.Currency, tx.AccountID, tx.DestinationAccountID, tx.CategoryID,
		tx.IncomeSourceID, tx.BusinessID, tx.AssetID, tx.LoanID, tx.Quantity, tx.UnitPrice, fees, note, tx.Source, tx.ImportID,
		tx.OriginEventID, tx.OriginEventType,
	).Scan(
		&result.ID, &result.UserID, &result.TransactionDate, &result.EntryKind, &result.Amount, &result.Currency,
		&result.AccountID, &result.DestinationAccountID, &result.CategoryID, &result.IncomeSourceID, &result.BusinessID, &result.AssetID, &result.LoanID,
		&result.Quantity, &result.UnitPrice, &result.Fees, &result.Note, &result.Source, &result.ImportID,
		&result.OriginEventID, &result.OriginEventType, &result.DeletedAt, &result.CreatedAt, &result.UpdatedAt,
	)
	return result, err
}

func (s *TransactionStore) Update(ctx context.Context, id, userID string, tx Transaction) (Transaction, error) {
	note := ""
	if tx.Note != nil {
		note = *tx.Note
	}

	var result Transaction
	err := s.db.QueryRow(ctx, `
		update transactions
		set entry_kind = $1, amount = $2, account_id = $3, destination_account_id = $4, category_id = $5,
		    income_source_id = $6, business_id = $7, note = $8, updated_at = now()
		where id = $9 and user_id = $10 and deleted_at is null
		returning id, user_id, transaction_date::text, entry_kind, amount::bigint, currency, account_id, destination_account_id, category_id,
		          income_source_id, business_id, asset_id, loan_id, quantity, unit_price::bigint, fees::bigint, note, source, import_id,
		          origin_event_id::text, origin_event_type, deleted_at::text, created_at::text, updated_at::text
		`, tx.EntryKind, tx.Amount, tx.AccountID, tx.DestinationAccountID, tx.CategoryID, tx.IncomeSourceID, tx.BusinessID, note, id, userID,
	).Scan(
		&result.ID, &result.UserID, &result.TransactionDate, &result.EntryKind, &result.Amount, &result.Currency,
		&result.AccountID, &result.DestinationAccountID, &result.CategoryID, &result.IncomeSourceID, &result.BusinessID, &result.AssetID, &result.LoanID,
		&result.Quantity, &result.UnitPrice, &result.Fees, &result.Note, &result.Source, &result.ImportID,
		&result.OriginEventID, &result.OriginEventType, &result.DeletedAt, &result.CreatedAt, &result.UpdatedAt,
	)
	return result, err
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
