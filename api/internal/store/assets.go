package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Asset struct {
	ID               string  `json:"id"`
	UserID           string  `json:"userId"`
	InvestmentTypeID string  `json:"investmentTypeId"`
	AssetClass       string  `json:"assetClass"`
	Name             string  `json:"name"` // e.g., "LuSE Stock", "Treasury Bond", "Chitenge Group"
	Symbol           *string `json:"symbol"`
	Currency         string  `json:"currency"`
	CreatedAt        string  `json:"createdAt"`
}

type AssetStore struct {
	db *pgxpool.Pool
}

func NewAssetStore(db *pgxpool.Pool) *AssetStore {
	return &AssetStore{db: db}
}

func (s *AssetStore) ListByUser(ctx context.Context, userID string) ([]Asset, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, investment_type_id, asset_class, name, symbol, currency, created_at::text
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
		if err := rows.Scan(&a.ID, &a.UserID, &a.InvestmentTypeID, &a.AssetClass, &a.Name, &a.Symbol, &a.Currency, &a.CreatedAt); err != nil {
			return nil, err
		}
		assets = append(assets, a)
	}

	return assets, rows.Err()
}

func (s *AssetStore) ListByInvestmentType(ctx context.Context, userID, investmentTypeID string) ([]Asset, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, investment_type_id, asset_class, name, symbol, currency, created_at::text
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
		if err := rows.Scan(&a.ID, &a.UserID, &a.InvestmentTypeID, &a.AssetClass, &a.Name, &a.Symbol, &a.Currency, &a.CreatedAt); err != nil {
			return nil, err
		}
		assets = append(assets, a)
	}

	return assets, rows.Err()
}

func (s *AssetStore) Create(ctx context.Context, userID, investmentTypeID, assetClass, name, currency string, symbol *string) (Asset, error) {
	var asset Asset
	if assetClass == "" {
		assetClass = "other"
	}
	if currency == "" {
		currency = "ZMW"
	}
	err := s.db.QueryRow(ctx, `
		insert into assets (user_id, investment_type_id, asset_class, name, symbol, currency)
		values ($1, $2, $3, $4, $5, $6)
		returning id, user_id, investment_type_id, asset_class, name, symbol, currency, created_at::text
	`, userID, investmentTypeID, assetClass, name, symbol, currency).Scan(
		&asset.ID,
		&asset.UserID,
		&asset.InvestmentTypeID,
		&asset.AssetClass,
		&asset.Name,
		&asset.Symbol,
		&asset.Currency,
		&asset.CreatedAt,
	)
	return asset, normalizeWriteError(err)
}

func (s *AssetStore) Update(ctx context.Context, id, userID, assetClass, name, currency string, symbol *string) (Asset, error) {
	var asset Asset
	if assetClass == "" {
		assetClass = "other"
	}
	if currency == "" {
		currency = "ZMW"
	}
	err := s.db.QueryRow(ctx, `
		update assets
		set asset_class = $1, name = $2, symbol = $3, currency = $4
		where id = $5 and user_id = $6
		returning id, user_id, investment_type_id, asset_class, name, symbol, currency, created_at::text
	`, assetClass, name, symbol, currency, id, userID).Scan(
		&asset.ID,
		&asset.UserID,
		&asset.InvestmentTypeID,
		&asset.AssetClass,
		&asset.Name,
		&asset.Symbol,
		&asset.Currency,
		&asset.CreatedAt,
	)
	return asset, normalizeWriteError(err)
}

func (s *AssetStore) Delete(ctx context.Context, id, userID string) error {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var lockedID string
	err = tx.QueryRow(ctx, `
		select id
		from assets
		where id = $1 and user_id = $2
		for update
	`, id, userID).Scan(&lockedID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	var hasLaterActivity bool
	err = tx.QueryRow(ctx, `
		select exists (
			select 1
			from transactions
			where user_id = $1
			  and asset_id = $2
			  and deleted_at is null
			  and (
				entry_kind <> 'investment_buy'
				or origin_event_type is not null
			  )
		)
	`, userID, id).Scan(&hasLaterActivity)
	if err != nil {
		return err
	}
	if hasLaterActivity {
		return ErrAssetHasActivity
	}

	// Removing a mistaken investment must also reverse its purchases from cash
	// balances. Transactions remain soft-deleted for auditability; asset lots,
	// valuations, and projected bond records are removed by their FK cascades.
	if _, err = tx.Exec(ctx, `
		update transactions
		set deleted_at = now(), updated_at = now()
		where user_id = $1
		  and asset_id = $2
		  and deleted_at is null
		  and entry_kind = 'investment_buy'
	`, userID, id); err != nil {
		return err
	}

	tag, err := tx.Exec(ctx, `
		delete from assets
		where id = $1 and user_id = $2
	`, id, userID)
	if err := normalizeExecResult(tag, err); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
