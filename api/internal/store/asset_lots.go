package store

import (
	"context"
	"errors"
	"math"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AssetLot struct {
	ID                string  `json:"id"`
	UserID            string  `json:"userId"`
	AssetID           string  `json:"assetId"`
	TransactionID     *string `json:"transactionId"`
	Quantity          float64 `json:"quantity"`
	RemainingQuantity float64 `json:"remainingQuantity"`
	UnitPrice         int64   `json:"unitPrice"`
	Fees              int64   `json:"fees"`
	TotalCost         int64   `json:"totalCost"`
	AcquisitionDate   string  `json:"acquisitionDate"`
	CreatedAt         string  `json:"createdAt"`
}

type AssetHolding struct {
	AssetID           string  `json:"assetId"`
	Quantity          float64 `json:"quantity"`
	TotalCost         int64   `json:"totalCost"`
	AverageCostBasis  int64   `json:"avgCostBasis"`
	UnrealizedPnL     int64   `json:"unrealizedPnl"`
	CurrentValueMinor int64   `json:"currentValueMinor"`
}

type EquitySellInput struct {
	AssetID        string  `json:"assetId"`
	CashAccountID  string  `json:"cashAccountId"`
	Quantity       float64 `json:"quantity"`
	UnitPriceMinor int64   `json:"unitPriceMinor"`
	FeesMinor      int64   `json:"feesMinor"`
	Currency       string  `json:"currency"`
	ExecutionDate  string  `json:"executionDate"`
	Note           string  `json:"note"`
}

type DividendInput struct {
	AssetID             string `json:"assetId"`
	CashAccountID       string `json:"cashAccountId"`
	AmountMinor         int64  `json:"amountMinor"`
	ReinvestmentPrice   int64  `json:"reinvestmentPriceMinor"`
	Currency            string `json:"currency"`
	ExecutionDate       string `json:"executionDate"`
	Note                string `json:"note"`
	DividendDisposition string `json:"dividendDisposition"`
}

type EquityActionResult struct {
	OriginEventID string        `json:"originEventId"`
	RealizedGain  int64         `json:"realizedGain"`
	Quantity      float64       `json:"quantity"`
	Transactions  []Transaction `json:"transactions"`
	Holding       AssetHolding  `json:"holding"`
}

type AssetLotStore struct {
	db *pgxpool.Pool
}

func NewAssetLotStore(db *pgxpool.Pool) *AssetLotStore {
	return &AssetLotStore{db: db}
}

func (s *AssetLotStore) Create(ctx context.Context, lot AssetLot) (AssetLot, error) {
	return createAssetLot(ctx, s.db, lot)
}

func (s *AssetLotStore) CreateWithTx(ctx context.Context, dbTx pgx.Tx, lot AssetLot) (AssetLot, error) {
	return createAssetLot(ctx, dbTx, lot)
}

type assetLotRowQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func createAssetLot(ctx context.Context, db assetLotRowQuerier, lot AssetLot) (AssetLot, error) {
	if lot.RemainingQuantity == 0 {
		lot.RemainingQuantity = lot.Quantity
	}
	if lot.TotalCost == 0 {
		lot.TotalCost = int64(math.Round(lot.Quantity*float64(lot.UnitPrice))) + lot.Fees
	}

	var result AssetLot
	err := db.QueryRow(ctx, `
		insert into asset_lots (
			user_id, asset_id, transaction_id, quantity, remaining_quantity, unit_cost, unit_price,
			fees, total_cost, acquired_at, acquisition_date
		)
		values ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $9)
		returning id, user_id, asset_id, transaction_id, quantity, remaining_quantity,
		          unit_price, fees, total_cost, acquisition_date, created_at
	`, lot.UserID, lot.AssetID, lot.TransactionID, lot.Quantity, lot.RemainingQuantity, lot.UnitPrice,
		lot.Fees, lot.TotalCost, lot.AcquisitionDate,
	).Scan(
		&result.ID,
		&result.UserID,
		&result.AssetID,
		&result.TransactionID,
		&result.Quantity,
		&result.RemainingQuantity,
		&result.UnitPrice,
		&result.Fees,
		&result.TotalCost,
		&result.AcquisitionDate,
		&result.CreatedAt,
	)
	return result, err
}

func (s *AssetLotStore) ListByAsset(ctx context.Context, userID, assetID string) ([]AssetLot, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, asset_id, transaction_id, quantity, remaining_quantity,
		       unit_price, fees, total_cost, acquisition_date, created_at
		from asset_lots
		where user_id = $1 and asset_id = $2
		order by acquisition_date asc, created_at asc
	`, userID, assetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lots []AssetLot
	for rows.Next() {
		var lot AssetLot
		if err := rows.Scan(
			&lot.ID,
			&lot.UserID,
			&lot.AssetID,
			&lot.TransactionID,
			&lot.Quantity,
			&lot.RemainingQuantity,
			&lot.UnitPrice,
			&lot.Fees,
			&lot.TotalCost,
			&lot.AcquisitionDate,
			&lot.CreatedAt,
		); err != nil {
			return nil, err
		}
		lots = append(lots, lot)
	}

	return lots, rows.Err()
}

func (s *AssetLotStore) GetHolding(ctx context.Context, userID, assetID string) (map[string]interface{}, error) {
	holding, err := s.GetAssetHolding(ctx, userID, assetID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"quantity":      holding.Quantity,
		"totalCost":     holding.TotalCost,
		"avgCostBasis":  holding.AverageCostBasis,
		"unrealizedPnl": holding.UnrealizedPnL,
		"currentValue":  holding.CurrentValueMinor,
	}, nil
}

func (s *AssetLotStore) GetAssetHolding(ctx context.Context, userID, assetID string) (AssetHolding, error) {
	var holding AssetHolding
	holding.AssetID = assetID

	err := s.db.QueryRow(ctx, `
		select
			coalesce(sum(remaining_quantity), 0)::float8,
			coalesce(sum(round(total_cost::numeric * remaining_quantity / nullif(quantity, 0))), 0)::bigint
		from asset_lots
		where user_id = $1 and asset_id = $2
	`, userID, assetID).Scan(&holding.Quantity, &holding.TotalCost)
	if err != nil {
		return holding, err
	}

	if holding.Quantity > 0 {
		holding.AverageCostBasis = int64(math.Round(float64(holding.TotalCost) / holding.Quantity))
	}

	if err := s.db.QueryRow(ctx, `
		select coalesce(
			(
				select current_value_minor
				from asset_valuations
				where asset_id = $1
				order by valuation_date desc, created_at desc
				limit 1
			),
			$2
		)::bigint
	`, assetID, holding.TotalCost).Scan(&holding.CurrentValueMinor); err != nil {
		return holding, err
	}

	holding.UnrealizedPnL = holding.CurrentValueMinor - holding.TotalCost
	return holding, nil
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

func (s *AssetLotStore) SellFIFO(ctx context.Context, userID string, input EquitySellInput) (EquityActionResult, error) {
	if input.Quantity <= 0 || input.UnitPriceMinor <= 0 {
		return EquityActionResult{}, errors.New("quantity and unit price are required")
	}
	if input.Currency == "" {
		input.Currency = "ZMW"
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return EquityActionResult{}, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		select id, quantity::float8, remaining_quantity::float8, total_cost::bigint
		from asset_lots
		where user_id = $1 and asset_id = $2 and remaining_quantity > 0
		order by acquisition_date asc, created_at asc
		for update
	`, userID, input.AssetID)
	if err != nil {
		return EquityActionResult{}, err
	}

	type lotRow struct {
		id        string
		quantity  float64
		remaining float64
		totalCost int64
	}
	lots := make([]lotRow, 0)
	for rows.Next() {
		var lot lotRow
		if err := rows.Scan(&lot.id, &lot.quantity, &lot.remaining, &lot.totalCost); err != nil {
			rows.Close()
			return EquityActionResult{}, err
		}
		lots = append(lots, lot)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return EquityActionResult{}, err
	}

	remainingToSell := input.Quantity
	consumedCost := int64(0)
	for _, lot := range lots {
		if remainingToSell <= 0 {
			break
		}
		consume := math.Min(remainingToSell, lot.remaining)
		cost := int64(math.Round(float64(lot.totalCost) * consume / lot.quantity))
		newRemaining := lot.remaining - consume
		if _, err := tx.Exec(ctx, `
			update asset_lots
			set remaining_quantity = $1, updated_at = now()
			where id = $2
		`, newRemaining, lot.id); err != nil {
			return EquityActionResult{}, err
		}
		consumedCost += cost
		remainingToSell -= consume
	}
	if remainingToSell > 0.000001 {
		return EquityActionResult{}, errors.New("not enough shares to sell")
	}

	var originEventID string
	if err := tx.QueryRow(ctx, `select gen_random_uuid()::text`).Scan(&originEventID); err != nil {
		return EquityActionResult{}, err
	}
	originType := "equity_sell"
	grossProceeds := int64(math.Round(input.Quantity * float64(input.UnitPriceMinor)))
	netProceeds := grossProceeds - input.FeesMinor
	if netProceeds < 0 {
		return EquityActionResult{}, errors.New("fees exceed proceeds")
	}
	note := input.Note
	if note == "" {
		note = "Stock sale"
	}

	saleTx, err := insertLoanTransaction(ctx, tx, Transaction{
		UserID:          userID,
		TransactionDate: input.ExecutionDate,
		EntryKind:       "investment_sell",
		Amount:          netProceeds,
		Currency:        input.Currency,
		AccountID:       input.CashAccountID,
		AssetID:         &input.AssetID,
		Quantity:        &input.Quantity,
		UnitPrice:       &input.UnitPriceMinor,
		Fees:            &input.FeesMinor,
		Note:            &note,
		Source:          "manual",
		OriginEventID:   &originEventID,
		OriginEventType: &originType,
	})
	if err != nil {
		return EquityActionResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return EquityActionResult{}, err
	}

	holding, err := s.GetAssetHolding(ctx, userID, input.AssetID)
	if err != nil {
		return EquityActionResult{}, err
	}

	return EquityActionResult{
		OriginEventID: originEventID,
		RealizedGain:  netProceeds - consumedCost,
		Quantity:      input.Quantity,
		Transactions:  []Transaction{saleTx},
		Holding:       holding,
	}, nil
}

func (s *AssetLotStore) RecordDividend(ctx context.Context, userID string, input DividendInput) (EquityActionResult, error) {
	if input.AmountMinor <= 0 {
		return EquityActionResult{}, errors.New("amount is required")
	}
	if input.Currency == "" {
		input.Currency = "ZMW"
	}
	if input.DividendDisposition == "" {
		input.DividendDisposition = "cash"
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return EquityActionResult{}, err
	}
	defer tx.Rollback(ctx)

	var originEventID string
	if err := tx.QueryRow(ctx, `select gen_random_uuid()::text`).Scan(&originEventID); err != nil {
		return EquityActionResult{}, err
	}
	originType := "equity_dividend"
	note := input.Note
	if note == "" {
		note = "Dividend"
	}

	created := make([]Transaction, 0, 1)
	quantity := float64(0)
	if input.DividendDisposition == "drip" {
		if input.ReinvestmentPrice <= 0 {
			return EquityActionResult{}, errors.New("reinvestment price is required for DRIP")
		}
		quantity = float64(input.AmountMinor) / float64(input.ReinvestmentPrice)
		dripTx, err := insertLoanTransaction(ctx, tx, Transaction{
			UserID:          userID,
			TransactionDate: input.ExecutionDate,
			EntryKind:       "dividend_drip",
			Amount:          input.AmountMinor,
			Currency:        input.Currency,
			AccountID:       input.CashAccountID,
			AssetID:         &input.AssetID,
			Quantity:        &quantity,
			UnitPrice:       &input.ReinvestmentPrice,
			Note:            &note,
			Source:          "manual",
			OriginEventID:   &originEventID,
			OriginEventType: &originType,
		})
		if err != nil {
			return EquityActionResult{}, err
		}
		created = append(created, dripTx)

		if _, err := tx.Exec(ctx, `
			insert into asset_lots (
				user_id, asset_id, transaction_id, quantity, remaining_quantity, unit_cost, unit_price,
				fees, total_cost, acquired_at, acquisition_date
			)
			values ($1, $2, $3, $4, $4, $5, $5, 0, $6, $7, $7)
		`, userID, input.AssetID, dripTx.ID, quantity, input.ReinvestmentPrice, input.AmountMinor, input.ExecutionDate); err != nil {
			return EquityActionResult{}, err
		}
	} else {
		dividendTx, err := insertLoanTransaction(ctx, tx, Transaction{
			UserID:          userID,
			TransactionDate: input.ExecutionDate,
			EntryKind:       "investment_income",
			Amount:          input.AmountMinor,
			Currency:        input.Currency,
			AccountID:       input.CashAccountID,
			AssetID:         &input.AssetID,
			Note:            &note,
			Source:          "manual",
			OriginEventID:   &originEventID,
			OriginEventType: &originType,
		})
		if err != nil {
			return EquityActionResult{}, err
		}
		created = append(created, dividendTx)
	}

	if err := tx.Commit(ctx); err != nil {
		return EquityActionResult{}, err
	}

	holding, err := s.GetAssetHolding(ctx, userID, input.AssetID)
	if err != nil {
		return EquityActionResult{}, err
	}

	return EquityActionResult{
		OriginEventID: originEventID,
		Quantity:      quantity,
		Transactions:  created,
		Holding:       holding,
	}, nil
}
