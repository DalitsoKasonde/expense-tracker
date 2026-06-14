package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AssetLot struct {
	ID              string `json:"id"`
	UserID          string `json:"userId"`
	AssetID         string `json:"assetId"`
	TransactionID   string `json:"transactionId"`
	Quantity        float64 `json:"quantity"`
	UnitPrice       int64   `json:"unitPrice"` // in cents
	Fees            int64   `json:"fees"`      // in cents
	TotalCost       int64   `json:"totalCost"` // (quantity * unitPrice + fees) in cents
	AcquisitionDate string `json:"acquisitionDate"`
	CreatedAt       string `json:"createdAt"`
}

type AssetLotStore struct {
	db *pgxpool.Pool
}

func NewAssetLotStore(db *pgxpool.Pool) *AssetLotStore {
	return &AssetLotStore{db: db}
}

func (s *AssetLotStore) Create(ctx context.Context, lot AssetLot) (AssetLot, error) {
	var result AssetLot
	err := s.db.QueryRow(ctx, `
		insert into asset_lots (user_id, asset_id, transaction_id, quantity, unit_price, fees, total_cost, acquisition_date)
		values ($1, $2, $3, $4, $5, $6, $7, $8)
		returning id, user_id, asset_id, transaction_id, quantity, unit_price, fees, total_cost, acquisition_date, created_at
	`, lot.UserID, lot.AssetID, lot.TransactionID, lot.Quantity, lot.UnitPrice, lot.Fees, lot.TotalCost, lot.AcquisitionDate,
	).Scan(
		&result.ID, &result.UserID, &result.AssetID, &result.TransactionID, &result.Quantity, &result.UnitPrice, &result.Fees, &result.TotalCost, &result.AcquisitionDate, &result.CreatedAt,
	)
	return result, err
}

func (s *AssetLotStore) ListByAsset(ctx context.Context, userID, assetID string) ([]AssetLot, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, asset_id, transaction_id, quantity, unit_price, fees, total_cost, acquisition_date, created_at
		from asset_lots
		where user_id = $1 and asset_id = $2
		order by acquisition_date asc
	`, userID, assetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lots []AssetLot
	for rows.Next() {
		var lot AssetLot
		if err := rows.Scan(
			&lot.ID, &lot.UserID, &lot.AssetID, &lot.TransactionID, &lot.Quantity, &lot.UnitPrice, &lot.Fees, &lot.TotalCost, &lot.AcquisitionDate, &lot.CreatedAt,
		); err != nil {
			return nil, err
		}
		lots = append(lots, lot)
	}

	return lots, rows.Err()
}

func (s *AssetLotStore) GetHolding(ctx context.Context, userID, assetID string) (map[string]interface{}, error) {
	var totalQuantity float64
	var totalCost int64

	err := s.db.QueryRow(ctx, `
		select coalesce(sum(quantity), 0), coalesce(sum(total_cost), 0)
		from asset_lots
		where user_id = $1 and asset_id = $2
	`, userID, assetID).Scan(&totalQuantity, &totalCost)

	if err != nil {
		return nil, err
	}

	avgCostBasis := int64(0)
	if totalQuantity > 0 {
		avgCostBasis = int64(float64(totalCost) / totalQuantity)
	}

	return map[string]interface{}{
		"quantity":       totalQuantity,
		"totalCost":      totalCost,
		"avgCostBasis":   avgCostBasis,
	}, nil
}

func (s *AssetLotStore) ListAllHoldings(ctx context.Context, userID string) ([]map[string]interface{}, error) {
	rows, err := s.db.Query(ctx, `
		select distinct asset_id
		from asset_lots
		where user_id = $1
		group by asset_id
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	holdings := make([]map[string]interface{}, 0)
	for rows.Next() {
		var assetID string
		if err := rows.Scan(&assetID); err != nil {
			return nil, err
		}

		holding, err := s.GetHolding(ctx, userID, assetID)
		if err != nil {
			continue
		}

		holding["assetId"] = assetID
		holdings = append(holdings, holding)
	}

	return holdings, rows.Err()
}
