package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
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

const transactionFeeCategoryName = "Transaction fees"

// ensureTransactionFeeCategory returns the user's expense category used for
// movement fees. The transaction-scoped advisory lock prevents two concurrent
// first-time fee entries from creating case variants of the same category.
func ensureTransactionFeeCategory(ctx context.Context, tx pgx.Tx, userID string) (string, error) {
	if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1, 0))`, "transaction-fee-category:"+userID); err != nil {
		return "", err
	}

	var categoryID string
	err := tx.QueryRow(ctx, `
		select id
		from categories
		where user_id = $1
		  and category_group = 'expense'
		  and lower(btrim(name)) = lower($2)
		order by created_at, id
		limit 1
	`, userID, transactionFeeCategoryName).Scan(&categoryID)
	if err == nil {
		return categoryID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	err = tx.QueryRow(ctx, `
		insert into categories (user_id, name, category_group)
		values ($1, $2, 'expense')
		returning id
	`, userID, transactionFeeCategoryName).Scan(&categoryID)
	return categoryID, err
}

func (s *CategoryStore) ListByUser(ctx context.Context, userID string) ([]Category, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, name, category_group, parent_id, created_at::text
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

func (s *CategoryStore) GetByID(ctx context.Context, id, userID string) (Category, error) {
	var category Category
	err := s.db.QueryRow(ctx, `
		select id, user_id, name, category_group, parent_id, created_at::text
		from categories
		where id = $1 and user_id = $2
	`, id, userID).Scan(
		&category.ID,
		&category.UserID,
		&category.Name,
		&category.CategoryGroup,
		&category.ParentID,
		&category.CreatedAt,
	)
	return category, normalizeWriteError(err)
}

func (s *CategoryStore) Create(ctx context.Context, userID, name, categoryGroup string, parentID *string) (Category, error) {
	var category Category
	if categoryGroup == "" {
		categoryGroup = "expense"
	}
	if err := s.validateParent(ctx, userID, "", categoryGroup, parentID); err != nil {
		return Category{}, err
	}
	err := s.db.QueryRow(ctx, `
		insert into categories (user_id, name, category_group, parent_id)
		values ($1, $2, $3, $4)
		returning id, user_id, name, category_group, parent_id, created_at::text
	`, userID, name, categoryGroup, parentID).Scan(
		&category.ID,
		&category.UserID,
		&category.Name,
		&category.CategoryGroup,
		&category.ParentID,
		&category.CreatedAt,
	)
	return category, normalizeWriteError(err)
}

func (s *CategoryStore) Update(ctx context.Context, id, userID, name, categoryGroup string, parentID *string) (Category, error) {
	var category Category
	if categoryGroup == "" {
		categoryGroup = "expense"
	}
	if err := s.validateParent(ctx, userID, id, categoryGroup, parentID); err != nil {
		return Category{}, err
	}
	err := s.db.QueryRow(ctx, `
		update categories
		set name = $1, category_group = $2, parent_id = $3, updated_at = now()
		where id = $4 and user_id = $5
		returning id, user_id, name, category_group, parent_id, created_at::text
	`, name, categoryGroup, parentID, id, userID).Scan(
		&category.ID,
		&category.UserID,
		&category.Name,
		&category.CategoryGroup,
		&category.ParentID,
		&category.CreatedAt,
	)
	return category, normalizeWriteError(err)
}

func (s *CategoryStore) Delete(ctx context.Context, id, userID string) error {
	tag, err := s.db.Exec(ctx, `
		delete from categories
		where id = $1 and user_id = $2
		`, id, userID)
	return normalizeExecResult(tag, err)
}

func (s *CategoryStore) validateParent(ctx context.Context, userID, categoryID, categoryGroup string, parentID *string) error {
	if parentID == nil || *parentID == "" {
		return nil
	}

	if categoryID != "" && *parentID == categoryID {
		return ErrInvalidCategoryParent
	}

	var nextParentID *string
	var nextParentGroup string
	err := s.db.QueryRow(ctx, `
		select parent_id, category_group
		from categories
		where id = $1 and user_id = $2
	`, *parentID, userID).Scan(&nextParentID, &nextParentGroup)
	if err != nil {
		return ErrInvalidCategoryParent
	}
	if nextParentGroup != categoryGroup {
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
		var parentGroup string
		if err := s.db.QueryRow(ctx, `
			select parent_id, category_group
			from categories
			where id = $1 and user_id = $2
		`, *nextParentID, userID).Scan(&parentOfParent, &parentGroup); err != nil {
			return ErrInvalidCategoryParent
		}
		if parentGroup != categoryGroup {
			return ErrInvalidCategoryParent
		}
		nextParentID = parentOfParent
	}

	return nil
}
