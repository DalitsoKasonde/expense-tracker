package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Category struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type CategoryStore struct {
	db *pgxpool.Pool
}

func NewCategoryStore(db *pgxpool.Pool) *CategoryStore {
	return &CategoryStore{db: db}
}

func (s *CategoryStore) ListByUser(ctx context.Context, userID string) ([]Category, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, name, created_at
		from categories
		where user_id = $1
		order by name asc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []Category
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.CreatedAt); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}

	return categories, rows.Err()
}

func (s *CategoryStore) Create(ctx context.Context, userID, name string) (Category, error) {
	var category Category
	err := s.db.QueryRow(ctx, `
		insert into categories (user_id, name)
		values ($1, $2)
		returning id, user_id, name, created_at
	`, userID, name).Scan(
		&category.ID,
		&category.UserID,
		&category.Name,
		&category.CreatedAt,
	)
	return category, err
}

func (s *CategoryStore) Update(ctx context.Context, id, userID, name string) (Category, error) {
	var category Category
	err := s.db.QueryRow(ctx, `
		update categories
		set name = $1
		where id = $2 and user_id = $3
		returning id, user_id, name, created_at
	`, name, id, userID).Scan(
		&category.ID,
		&category.UserID,
		&category.Name,
		&category.CreatedAt,
	)
	return category, err
}

func (s *CategoryStore) Delete(ctx context.Context, id, userID string) error {
	_, err := s.db.Exec(ctx, `
		delete from categories
		where id = $1 and user_id = $2
	`, id, userID)
	return err
}
