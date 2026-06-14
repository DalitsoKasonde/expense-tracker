package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type InvestmentType struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Name      string `json:"name"` // stock, bond, savings_group, patuma, etc.
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
		select id, user_id, name, created_at
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
		if err := rows.Scan(&t.ID, &t.UserID, &t.Name, &t.CreatedAt); err != nil {
			return nil, err
		}
		types = append(types, t)
	}

	return types, rows.Err()
}

func (s *InvestmentTypeStore) Create(ctx context.Context, userID, name string) (InvestmentType, error) {
	var invType InvestmentType
	err := s.db.QueryRow(ctx, `
		insert into investment_types (user_id, name)
		values ($1, $2)
		returning id, user_id, name, created_at
	`, userID, name).Scan(
		&invType.ID,
		&invType.UserID,
		&invType.Name,
		&invType.CreatedAt,
	)
	return invType, err
}

func (s *InvestmentTypeStore) Update(ctx context.Context, id, userID, name string) (InvestmentType, error) {
	var invType InvestmentType
	err := s.db.QueryRow(ctx, `
		update investment_types
		set name = $1
		where id = $2 and user_id = $3
		returning id, user_id, name, created_at
	`, name, id, userID).Scan(
		&invType.ID,
		&invType.UserID,
		&invType.Name,
		&invType.CreatedAt,
	)
	return invType, err
}

func (s *InvestmentTypeStore) Delete(ctx context.Context, id, userID string) error {
	_, err := s.db.Exec(ctx, `
		delete from investment_types
		where id = $1 and user_id = $2
	`, id, userID)
	return err
}
