package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type IncomeSource struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type IncomeSourceStore struct {
	db *pgxpool.Pool
}

func NewIncomeSourceStore(db *pgxpool.Pool) *IncomeSourceStore {
	return &IncomeSourceStore{db: db}
}

func (s *IncomeSourceStore) ListByUser(ctx context.Context, userID string) ([]IncomeSource, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, name, created_at
		from income_sources
		where user_id = $1
		order by name asc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sources []IncomeSource
	for rows.Next() {
		var s IncomeSource
		if err := rows.Scan(&s.ID, &s.UserID, &s.Name, &s.CreatedAt); err != nil {
			return nil, err
		}
		sources = append(sources, s)
	}

	return sources, rows.Err()
}

func (s *IncomeSourceStore) Create(ctx context.Context, userID, name string) (IncomeSource, error) {
	var source IncomeSource
	err := s.db.QueryRow(ctx, `
		insert into income_sources (user_id, name)
		values ($1, $2)
		returning id, user_id, name, created_at
	`, userID, name).Scan(
		&source.ID,
		&source.UserID,
		&source.Name,
		&source.CreatedAt,
	)
	return source, err
}

func (s *IncomeSourceStore) Update(ctx context.Context, id, userID, name string) (IncomeSource, error) {
	var source IncomeSource
	err := s.db.QueryRow(ctx, `
		update income_sources
		set name = $1
		where id = $2 and user_id = $3
		returning id, user_id, name, created_at
	`, name, id, userID).Scan(
		&source.ID,
		&source.UserID,
		&source.Name,
		&source.CreatedAt,
	)
	return source, err
}

func (s *IncomeSourceStore) Delete(ctx context.Context, id, userID string) error {
	_, err := s.db.Exec(ctx, `
		delete from income_sources
		where id = $1 and user_id = $2
	`, id, userID)
	return err
}
