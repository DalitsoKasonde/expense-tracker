package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AssetValuation struct {
	ID                string `json:"id"`
	AssetID           string `json:"assetId"`
	ValuationDate     string `json:"valuationDate"`
	CurrentValueMinor int64  `json:"currentValueMinor"`
	Currency          string `json:"currency"`
	Source            string `json:"source"`
	CreatedAt         string `json:"createdAt"`
	UpdatedAt         string `json:"updatedAt"`
}

type AssetValuationStore struct {
	db *pgxpool.Pool
}

func NewAssetValuationStore(db *pgxpool.Pool) *AssetValuationStore {
	return &AssetValuationStore{db: db}
}

func (s *AssetValuationStore) Upsert(ctx context.Context, valuation AssetValuation) (AssetValuation, error) {
	if valuation.Currency == "" {
		valuation.Currency = "ZMW"
	}
	if valuation.Source == "" {
		valuation.Source = "manual"
	}

	var result AssetValuation
	err := s.db.QueryRow(ctx, `
		insert into asset_valuations (asset_id, valuation_date, current_value_minor, currency, source)
		values ($1, $2, $3, $4, $5)
		on conflict (asset_id, valuation_date, source)
		do update set
			current_value_minor = excluded.current_value_minor,
			currency = excluded.currency,
			updated_at = now()
		returning id, asset_id, valuation_date::text, current_value_minor, currency, source, created_at::text, updated_at::text
	`, valuation.AssetID, valuation.ValuationDate, valuation.CurrentValueMinor, valuation.Currency, valuation.Source).Scan(
		&result.ID,
		&result.AssetID,
		&result.ValuationDate,
		&result.CurrentValueMinor,
		&result.Currency,
		&result.Source,
		&result.CreatedAt,
		&result.UpdatedAt,
	)
	return result, normalizeWriteError(err)
}
