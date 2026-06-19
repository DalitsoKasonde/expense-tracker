package store

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type InvestmentType struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Name      string `json:"name"` // stock, bond, savings_group, patuma, etc.
	Code      string `json:"code"`
	ModelKind string `json:"modelKind"`
	CreatedAt string `json:"createdAt"`
}

type InvestmentTypeStore struct {
	db *pgxpool.Pool
}

func NewInvestmentTypeStore(db *pgxpool.Pool) *InvestmentTypeStore {
	return &InvestmentTypeStore{db: db}
}

func (s *InvestmentTypeStore) ListByUser(ctx context.Context, userID string) ([]InvestmentType, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, name, code, model_kind, created_at::text
		from investment_types
		where user_id = $1
		order by name asc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var types []InvestmentType
	for rows.Next() {
		var t InvestmentType
		if err := rows.Scan(&t.ID, &t.UserID, &t.Name, &t.Code, &t.ModelKind, &t.CreatedAt); err != nil {
			return nil, err
		}
		types = append(types, t)
	}

	return types, rows.Err()
}

func (s *InvestmentTypeStore) Create(ctx context.Context, userID, name string) (InvestmentType, error) {
	var invType InvestmentType
	code := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(name), " ", "_"))
	if code == "" {
		code = "other"
	}
	err := s.db.QueryRow(ctx, `
		insert into investment_types (user_id, name, code, model_kind)
		values ($1, $2, $3, $4)
		returning id, user_id, name, code, model_kind, created_at::text
	`, userID, name, code, "asset").Scan(
		&invType.ID,
		&invType.UserID,
		&invType.Name,
		&invType.Code,
		&invType.ModelKind,
		&invType.CreatedAt,
	)
	return invType, normalizeWriteError(err)
}

func (s *InvestmentTypeStore) Update(ctx context.Context, id, userID, name string) (InvestmentType, error) {
	var invType InvestmentType
	code := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(name), " ", "_"))
	if code == "" {
		code = "other"
	}
	err := s.db.QueryRow(ctx, `
		update investment_types
		set name = $1, code = $2
		where id = $3 and user_id = $4
		returning id, user_id, name, code, model_kind, created_at::text
	`, name, code, id, userID).Scan(
		&invType.ID,
		&invType.UserID,
		&invType.Name,
		&invType.Code,
		&invType.ModelKind,
		&invType.CreatedAt,
	)
	return invType, normalizeWriteError(err)
}

func (s *InvestmentTypeStore) Delete(ctx context.Context, id, userID string) error {
	tag, err := s.db.Exec(ctx, `
		delete from investment_types
		where id = $1 and user_id = $2
	`, id, userID)
	return normalizeExecResult(tag, err)
}

func (s *InvestmentTypeStore) FindByName(ctx context.Context, userID, name string) (InvestmentType, error) {
	var invType InvestmentType
	err := s.db.QueryRow(ctx, `
		select id, user_id, name, code, model_kind, created_at::text
		from investment_types
		where user_id = $1 and lower(name) = lower($2)
	`, userID, strings.TrimSpace(name)).Scan(
		&invType.ID,
		&invType.UserID,
		&invType.Name,
		&invType.Code,
		&invType.ModelKind,
		&invType.CreatedAt,
	)
	return invType, normalizeWriteError(err)
}

func (s *InvestmentTypeStore) FindOrCreate(ctx context.Context, userID, name string) (InvestmentType, error) {
	invType, err := s.FindByName(ctx, userID, name)
	if err == nil {
		return invType, nil
	}
	if err != nil && err != ErrNotFound && err != pgx.ErrNoRows {
		return InvestmentType{}, err
	}

	return s.Create(ctx, userID, strings.TrimSpace(name))
}
