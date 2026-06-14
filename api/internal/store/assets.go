package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Asset struct {
	ID               string `json:"id"`
	UserID           string `json:"userId"`
	InvestmentTypeID string `json:"investmentTypeId"`
	Name             string `json:"name"` // e.g., "LuSE Stock", "Treasury Bond", "Chitenge Group"
	Symbol           *string `json:"symbol"`
	CreatedAt        string `json:"createdAt"`
}

type AssetStore struct {
	db *pgxpool.Pool
}

func NewAssetStore(db *pgxpool.Pool) *AssetStore {
	return &AssetStore{db: db}
}

func (s *AssetStore) ListByUser(ctx context.Context, userID string) ([]Asset, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, investment_type_id, name, symbol, created_at
		from assets
		where user_id = $1
		order by name asc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assets []Asset
	for rows.Next() {
		var a Asset
		if err := rows.Scan(&a.ID, &a.UserID, &a.InvestmentTypeID, &a.Name, &a.Symbol, &a.CreatedAt); err != nil {
			return nil, err
		}
		assets = append(assets, a)
	}

	return assets, rows.Err()
}

func (s *AssetStore) ListByInvestmentType(ctx context.Context, userID, investmentTypeID string) ([]Asset, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, investment_type_id, name, symbol, created_at
		from assets
		where user_id = $1 and investment_type_id = $2
		order by name asc
	`, userID, investmentTypeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assets []Asset
	for rows.Next() {
		var a Asset
		if err := rows.Scan(&a.ID, &a.UserID, &a.InvestmentTypeID, &a.Name, &a.Symbol, &a.CreatedAt); err != nil {
			return nil, err
		}
		assets = append(assets, a)
	}

	return assets, rows.Err()
}

func (s *AssetStore) Create(ctx context.Context, userID, investmentTypeID, name string, symbol *string) (Asset, error) {
	var asset Asset
	err := s.db.QueryRow(ctx, `
		insert into assets (user_id, investment_type_id, name, symbol)
		values ($1, $2, $3, $4)
		returning id, user_id, investment_type_id, name, symbol, created_at
	`, userID, investmentTypeID, name, symbol).Scan(
		&asset.ID,
		&asset.UserID,
		&asset.InvestmentTypeID,
		&asset.Name,
		&asset.Symbol,
		&asset.CreatedAt,
	)
	return asset, err
}

func (s *AssetStore) Update(ctx context.Context, id, userID, name string, symbol *string) (Asset, error) {
	var asset Asset
	err := s.db.QueryRow(ctx, `
		update assets
		set name = $1, symbol = $2
		where id = $3 and user_id = $4
		returning id, user_id, investment_type_id, name, symbol, created_at
	`, name, symbol, id, userID).Scan(
		&asset.ID,
		&asset.UserID,
		&asset.InvestmentTypeID,
		&asset.Name,
		&asset.Symbol,
		&asset.CreatedAt,
	)
	return asset, err
}

func (s *AssetStore) Delete(ctx context.Context, id, userID string) error {
	_, err := s.db.Exec(ctx, `
		delete from assets
		where id = $1 and user_id = $2
	`, id, userID)
	return err
}
