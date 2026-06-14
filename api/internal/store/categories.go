package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Category struct {
	ID            string  `json:"id"`
	UserID        string  `json:"userId"`
	Name          string  `json:"name"`
	CategoryGroup string  `json:"categoryGroup"`
	ParentID      *string `json:"parentId"`
	CreatedAt     string  `json:"createdAt"`
}

type CategoryStore struct {
	db *pgxpool.Pool
}

func NewCategoryStore(db *pgxpool.Pool) *CategoryStore {
	return &CategoryStore{db: db}
}

var ErrInvalidCategoryParent = errors.New("invalid category parent")

func (s *CategoryStore) ListByUser(ctx context.Context, userID string) ([]Category, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, name, category_group, parent_id, created_at
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
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.CategoryGroup, &c.ParentID, &c.CreatedAt); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}

	return categories, rows.Err()
}

func (s *CategoryStore) Create(ctx context.Context, userID, name, categoryGroup string, parentID *string) (Category, error) {
	var category Category
	if categoryGroup == "" {
		categoryGroup = "expense"
	}
	if err := s.validateParent(ctx, userID, "", parentID); err != nil {
		return Category{}, err
	}
	err := s.db.QueryRow(ctx, `
		insert into categories (user_id, name, category_group, parent_id)
		values ($1, $2, $3, $4)
		returning id, user_id, name, category_group, parent_id, created_at
	`, userID, name, categoryGroup, parentID).Scan(
		&category.ID,
		&category.UserID,
		&category.Name,
		&category.CategoryGroup,
		&category.ParentID,
		&category.CreatedAt,
	)
	return category, err
}

func (s *CategoryStore) Update(ctx context.Context, id, userID, name, categoryGroup string, parentID *string) (Category, error) {
	var category Category
	if categoryGroup == "" {
		categoryGroup = "expense"
	}
	if err := s.validateParent(ctx, userID, id, parentID); err != nil {
		return Category{}, err
	}
	err := s.db.QueryRow(ctx, `
		update categories
		set name = $1, category_group = $2, parent_id = $3, updated_at = now()
		where id = $4 and user_id = $5
		returning id, user_id, name, category_group, parent_id, created_at
	`, name, categoryGroup, parentID, id, userID).Scan(
		&category.ID,
		&category.UserID,
		&category.Name,
		&category.CategoryGroup,
		&category.ParentID,
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

func (s *CategoryStore) validateParent(ctx context.Context, userID, categoryID string, parentID *string) error {
	if parentID == nil || *parentID == "" {
		return nil
	}

	if categoryID != "" && *parentID == categoryID {
		return ErrInvalidCategoryParent
	}

	var nextParentID *string
	err := s.db.QueryRow(ctx, `
		select parent_id
		from categories
		where id = $1 and user_id = $2
	`, *parentID, userID).Scan(&nextParentID)
	if err != nil {
		return ErrInvalidCategoryParent
	}

	seen := map[string]bool{*parentID: true}
	for nextParentID != nil && *nextParentID != "" {
		if categoryID != "" && *nextParentID == categoryID {
			return ErrInvalidCategoryParent
		}
		if seen[*nextParentID] {
			return ErrInvalidCategoryParent
		}
		seen[*nextParentID] = true

		var parentOfParent *string
		if err := s.db.QueryRow(ctx, `
			select parent_id
			from categories
			where id = $1 and user_id = $2
		`, *nextParentID, userID).Scan(&parentOfParent); err != nil {
			return ErrInvalidCategoryParent
		}
		nextParentID = parentOfParent
	}

	return nil
}
