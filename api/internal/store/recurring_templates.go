package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type RecurringTemplate struct {
	ID             string `json:"id"`
	UserID         string `json:"userId"`
	EntryKind      string `json:"entryKind"`
	Frequency      string `json:"frequency"` // daily, weekly, monthly, yearly
	Amount         int64  `json:"amount"`    // in cents
	Currency       string `json:"currency"`
	AccountID      string `json:"accountId"`
	CategoryID     *string `json:"categoryId"`
	IncomeSourceID *string `json:"incomeSourceId"`
	BusinessID     *string `json:"businessId"`
	Note           *string `json:"note"`
	NextDueDate    string `json:"nextDueDate"`
	IsActive       bool   `json:"isActive"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type RecurringTemplateStore struct {
	db *pgxpool.Pool
}

func NewRecurringTemplateStore(db *pgxpool.Pool) *RecurringTemplateStore {
	return &RecurringTemplateStore{db: db}
}

func (s *RecurringTemplateStore) ListByUser(ctx context.Context, userID string) ([]RecurringTemplate, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, entry_kind, frequency, amount, currency, account_id, category_id,
		       income_source_id, business_id, note, next_due_date, is_active, created_at, updated_at
		from recurring_templates
		where user_id = $1 and is_active = true
		order by next_due_date asc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []RecurringTemplate
	for rows.Next() {
		var t RecurringTemplate
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.EntryKind, &t.Frequency, &t.Amount, &t.Currency,
			&t.AccountID, &t.CategoryID, &t.IncomeSourceID, &t.BusinessID, &t.Note,
			&t.NextDueDate, &t.IsActive, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		templates = append(templates, t)
	}

	return templates, rows.Err()
}

func (s *RecurringTemplateStore) Create(ctx context.Context, t RecurringTemplate) (RecurringTemplate, error) {
	var result RecurringTemplate
	err := s.db.QueryRow(ctx, `
		insert into recurring_templates (user_id, entry_kind, frequency, amount, currency, account_id,
		                                  category_id, income_source_id, business_id, note, next_due_date, is_active)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
		returning id, user_id, entry_kind, frequency, amount, currency, account_id, category_id,
		          income_source_id, business_id, note, next_due_date, is_active, created_at, updated_at
	`, t.UserID, t.EntryKind, t.Frequency, t.Amount, t.Currency, t.AccountID,
		t.CategoryID, t.IncomeSourceID, t.BusinessID, t.Note, t.NextDueDate,
	).Scan(
		&result.ID, &result.UserID, &result.EntryKind, &result.Frequency, &result.Amount, &result.Currency,
		&result.AccountID, &result.CategoryID, &result.IncomeSourceID, &result.BusinessID, &result.Note,
		&result.NextDueDate, &result.IsActive, &result.CreatedAt, &result.UpdatedAt,
	)
	return result, err
}

func (s *RecurringTemplateStore) Update(ctx context.Context, id, userID string, t RecurringTemplate) (RecurringTemplate, error) {
	var result RecurringTemplate
	err := s.db.QueryRow(ctx, `
		update recurring_templates
		set entry_kind = $1, frequency = $2, amount = $3, account_id = $4, category_id = $5,
		    income_source_id = $6, business_id = $7, note = $8, next_due_date = $9, updated_at = now()
		where id = $10 and user_id = $11
		returning id, user_id, entry_kind, frequency, amount, currency, account_id, category_id,
		          income_source_id, business_id, note, next_due_date, is_active, created_at, updated_at
	`, t.EntryKind, t.Frequency, t.Amount, t.AccountID, t.CategoryID,
		t.IncomeSourceID, t.BusinessID, t.Note, t.NextDueDate, id, userID,
	).Scan(
		&result.ID, &result.UserID, &result.EntryKind, &result.Frequency, &result.Amount, &result.Currency,
		&result.AccountID, &result.CategoryID, &result.IncomeSourceID, &result.BusinessID, &result.Note,
		&result.NextDueDate, &result.IsActive, &result.CreatedAt, &result.UpdatedAt,
	)
	return result, err
}

func (s *RecurringTemplateStore) Delete(ctx context.Context, id, userID string) error {
	_, err := s.db.Exec(ctx, `
		update recurring_templates
		set is_active = false, updated_at = now()
		where id = $1 and user_id = $2
	`, id, userID)
	return err
}
