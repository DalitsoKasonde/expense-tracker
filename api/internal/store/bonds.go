package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type BondPosition struct {
	AssetID                string  `json:"assetId"`
	UserID                 string  `json:"userId"`
	Name                   string  `json:"name"`
	Symbol                 *string `json:"symbol"`
	Currency               string  `json:"currency"`
	CashAccountID          string  `json:"cashAccountId"`
	PrincipalMinor         int64   `json:"principalMinor"`
	PurchaseFeeMinor       int64   `json:"purchaseFeeMinor"`
	CouponRateBps          int     `json:"couponRateBps"`
	IssueDate              string  `json:"issueDate"`
	MaturityDate           string  `json:"maturityDate"`
	CouponFrequencyPerYear int     `json:"couponFrequencyPerYear"`
	ReinvestmentCutoffDate string  `json:"reinvestmentCutoffDate"`
	CreatedAt              string  `json:"createdAt"`
	UpdatedAt              string  `json:"updatedAt"`
}

type BondCashflow struct {
	ID                    string  `json:"id"`
	AssetID               string  `json:"assetId"`
	CashAccountID         string  `json:"cashAccountId"`
	EventType             string  `json:"eventType"`
	Disposition           string  `json:"disposition"`
	ScheduledDate         string  `json:"scheduledDate"`
	GrossAmountMinor      int64   `json:"grossAmountMinor"`
	TaxAmountMinor        int64   `json:"taxAmountMinor"`
	NetAmountMinor        int64   `json:"netAmountMinor"`
	Status                string  `json:"status"`
	PostedTransactionID   *string `json:"postedTransactionId"`
	DestinationAssetID    *string `json:"destinationAssetId"`
	ReinvestTransactionID *string `json:"reinvestTransactionId"`
	PaymentDate           *string `json:"paymentDate"`
	ConfirmedAt           *string `json:"confirmedAt"`
}

type BondProjection struct {
	Bond                      BondPosition   `json:"bond"`
	Cashflows                 []BondCashflow `json:"cashflows"`
	TotalProjectedPayoutMinor int64          `json:"totalProjectedPayoutMinor"`
	TotalGrossCouponMinor     int64          `json:"totalGrossCouponMinor"`
	TotalCouponTaxMinor       int64          `json:"totalCouponTaxMinor"`
	TotalCouponMinor          int64          `json:"totalCouponMinor"`
	TotalCashBalanceMinor     int64          `json:"totalCashBalanceMinor"`
	TotalReinvestedMinor      int64          `json:"totalReinvestedMinor"`
	// The totals above count every scheduled cashflow, so they describe the
	// bond's whole life rather than what has happened. These count only posted
	// cashflows — money that has actually been paid.
	CouponGrossReceivedMinor int64 `json:"couponGrossReceivedMinor"`
	CouponTaxWithheldMinor   int64 `json:"couponTaxWithheldMinor"`
	CouponNetReceivedMinor   int64 `json:"couponNetReceivedMinor"`
	CouponsReceivedCount     int   `json:"couponsReceivedCount"`
}

/*
BondCurrencySummary is realised bond performance for one currency.

A bond is carried at principal, so current value minus cost is structurally
zero for its whole life and says nothing about how the holding has done. What it
actually earns is coupons, which post to a cash account as income. This
separates the two: the Received fields are money paid, the Outstanding field is
money still scheduled.
*/
type BondCurrencySummary struct {
	Currency       string `json:"currency"`
	HoldingCount   int    `json:"holdingCount"`
	PrincipalMinor int64  `json:"principalMinor"`

	// Realised — posted coupons only.
	CouponGrossReceivedMinor int64 `json:"couponGrossReceivedMinor"`
	CouponTaxWithheldMinor   int64 `json:"couponTaxWithheldMinor"`
	CouponNetReceivedMinor   int64 `json:"couponNetReceivedMinor"`
	CouponsReceivedCount     int   `json:"couponsReceivedCount"`
	// A breakdown of CouponNetReceivedMinor by where the money went, not an
	// addition to it. Summing these with the net total would double count.
	ReinvestedMinor        int64 `json:"reinvestedMinor"`
	PaidToCashMinor        int64 `json:"paidToCashMinor"`
	PrincipalRedeemedMinor int64 `json:"principalRedeemedMinor"`

	// Still scheduled — explicitly not part of any gain figure.
	CouponNetOutstandingMinor int64  `json:"couponNetOutstandingMinor"`
	NextCouponDate            string `json:"nextCouponDate,omitempty"`
	NextCouponNetMinor        int64  `json:"nextCouponNetMinor"`
}

/*
summarizeBonds folds positions and their cashflows into per-currency totals.

Kept separate from the query so the arithmetic — particularly "posted means
received" and the reinvested/cash split being a breakdown rather than an
addition — can be tested without a database. Currencies are never mixed: a
kwacha coupon and a dollar coupon are different facts.
*/
func summarizeBonds(positions []BondPosition, cashflowsByAsset map[string][]BondCashflow) []BondCurrencySummary {
	currencyOf := make(map[string]string, len(positions))
	order := make([]string, 0)
	byCurrency := make(map[string]*BondCurrencySummary)

	summaryFor := func(currency string) *BondCurrencySummary {
		if existing, ok := byCurrency[currency]; ok {
			return existing
		}
		created := &BondCurrencySummary{Currency: currency}
		byCurrency[currency] = created
		order = append(order, currency)
		return created
	}

	for _, position := range positions {
		currencyOf[position.AssetID] = position.Currency
		summary := summaryFor(position.Currency)
		summary.HoldingCount++
		summary.PrincipalMinor += position.PrincipalMinor
	}

	for assetID, cashflows := range cashflowsByAsset {
		currency, ok := currencyOf[assetID]
		if !ok {
			// A cashflow whose bond is not in the caller's position list is not
			// this user's to report on.
			continue
		}
		summary := summaryFor(currency)

		for _, cashflow := range cashflows {
			switch {
			case cashflow.EventType == "coupon" && cashflow.Status == "posted":
				summary.CouponGrossReceivedMinor += cashflow.GrossAmountMinor
				summary.CouponTaxWithheldMinor += cashflow.TaxAmountMinor
				summary.CouponNetReceivedMinor += cashflow.NetAmountMinor
				summary.CouponsReceivedCount++
				if cashflow.Disposition == "reinvest" {
					summary.ReinvestedMinor += cashflow.NetAmountMinor
				} else {
					summary.PaidToCashMinor += cashflow.NetAmountMinor
				}
			case cashflow.EventType == "coupon" && cashflow.Status == "projected":
				summary.CouponNetOutstandingMinor += cashflow.NetAmountMinor
				if summary.NextCouponDate == "" || cashflow.ScheduledDate < summary.NextCouponDate {
					summary.NextCouponDate = cashflow.ScheduledDate
					summary.NextCouponNetMinor = cashflow.NetAmountMinor
				}
			case cashflow.EventType == "principal_redemption" && cashflow.Status == "posted":
				summary.PrincipalRedeemedMinor += cashflow.NetAmountMinor
			}
		}
	}

	summaries := make([]BondCurrencySummary, 0, len(order))
	for _, currency := range order {
		summaries = append(summaries, *byCurrency[currency])
	}
	return summaries
}

/*
SummarizeByUser reports realised bond performance per currency across every bond
the user holds, so a dashboard needs one request rather than one per holding.

It posts due cashflows first, for the same reason the unified dashboard does.
Without it this endpoint would race the dashboard: both are fetched together, and
whichever arrives first decides whether a coupon that came due today has been
turned into income yet — so income could read low until the next reload. Posting
is idempotent (it only moves projected rows), so doing it here is safe.
*/
func (s *BondStore) SummarizeByUser(ctx context.Context, userID string, asOf time.Time) ([]BondCurrencySummary, error) {
	if err := s.PostDueCashflows(ctx, userID, asOf); err != nil {
		return nil, err
	}

	positions, err := s.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(positions) == 0 {
		return []BondCurrencySummary{}, nil
	}

	rows, err := s.db.Query(ctx, `
		select bc.asset_id, bc.event_type, bc.disposition, bc.scheduled_date::text,
		       bc.gross_amount_minor, bc.tax_amount_minor, bc.net_amount_minor, bc.status
		from bond_cashflows bc
		join assets a on a.id = bc.asset_id
		where a.user_id = $1
		order by bc.scheduled_date asc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cashflowsByAsset := make(map[string][]BondCashflow)
	for rows.Next() {
		var cashflow BondCashflow
		if err := rows.Scan(
			&cashflow.AssetID,
			&cashflow.EventType,
			&cashflow.Disposition,
			&cashflow.ScheduledDate,
			&cashflow.GrossAmountMinor,
			&cashflow.TaxAmountMinor,
			&cashflow.NetAmountMinor,
			&cashflow.Status,
		); err != nil {
			return nil, err
		}
		cashflowsByAsset[cashflow.AssetID] = append(cashflowsByAsset[cashflow.AssetID], cashflow)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return summarizeBonds(positions, cashflowsByAsset), nil
}

type CreateBondInput struct {
	Name                   string  `json:"name"`
	Symbol                 *string `json:"symbol"`
	Currency               string  `json:"currency"`
	CashAccountID          string  `json:"cashAccountId"`
	PrincipalMinor         int64   `json:"principalMinor"`
	PurchaseFeeMinor       int64   `json:"purchaseFeeMinor"`
	CouponRateBps          int     `json:"couponRateBps"`
	IssueDate              string  `json:"issueDate"`
	MaturityDate           string  `json:"maturityDate"`
	CouponFrequencyPerYear int     `json:"couponFrequencyPerYear"`
	ReinvestmentCutoffDate string  `json:"reinvestmentCutoffDate"`
	HistoricalBackfill     bool    `json:"historicalBackfill"`
}

type AddBondPurchaseInput struct {
	CashAccountID      string `json:"cashAccountId"`
	PrincipalMinor     int64  `json:"principalMinor"`
	PurchaseFeeMinor   int64  `json:"purchaseFeeMinor"`
	PurchaseDate       string `json:"purchaseDate"`
	Note               string `json:"note"`
	HistoricalBackfill bool   `json:"historicalBackfill"`
}

type ConfirmBondCouponInput struct {
	CashflowID         string `json:"-"`
	CashAccountID      string `json:"cashAccountId"`
	GrossAmountMinor   int64  `json:"grossAmountMinor"`
	TaxAmountMinor     int64  `json:"taxAmountMinor"`
	PaymentDate        string `json:"paymentDate"`
	Destination        string `json:"destination"`
	DestinationAssetID string `json:"destinationAssetId"`
	UnitPriceMinor     int64  `json:"unitPriceMinor"`
	PurchaseFeeMinor   int64  `json:"purchaseFeeMinor"`
	HistoricalBackfill bool   `json:"historicalBackfill"`
}

type BondStore struct {
	db *pgxpool.Pool
}

func NewBondStore(db *pgxpool.Pool) *BondStore {
	return &BondStore{db: db}
}

func (s *BondStore) Create(ctx context.Context, userID string, input CreateBondInput) (BondPosition, error) {
	if err := validateBondInput(input); err != nil {
		return BondPosition{}, err
	}

	if input.Currency == "" {
		input.Currency = "ZMW"
	}
	if input.CouponFrequencyPerYear == 0 {
		input.CouponFrequencyPerYear = 2
	}

	issueDate, _ := time.Parse(dateLayout, input.IssueDate)
	maturityDate, _ := time.Parse(dateLayout, input.MaturityDate)
	cutoffDate, _ := time.Parse(dateLayout, input.ReinvestmentCutoffDate)

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return BondPosition{}, err
	}
	defer tx.Rollback(ctx)

	// A historical bond may name no account at all; validateBondInput has
	// already refused an empty account for every other case.
	if input.CashAccountID != "" {
		var accountExists bool
		if err := tx.QueryRow(ctx, `
			select exists(
				select 1
				from accounts
				where id = $1 and user_id = $2 and archived_at is null
			)
		`, input.CashAccountID, userID).Scan(&accountExists); err != nil {
			return BondPosition{}, err
		}
		if !accountExists {
			return BondPosition{}, ErrNotFound
		}
	}

	bondTypeID, err := findOrCreateBondInvestmentType(ctx, tx, userID)
	if err != nil {
		return BondPosition{}, err
	}

	symbol := normalizeAssetSymbol(input.Name, input.Symbol)

	var position BondPosition
	err = tx.QueryRow(ctx, `
		with new_asset as (
			insert into assets (user_id, investment_type_id, asset_class, name, symbol, currency)
			values ($1, $2, 'bond', $3, $4, $5)
			returning id, user_id, name, symbol, currency
		)
		insert into bond_positions (
			asset_id, cash_account_id, principal_minor, purchase_fee_minor, coupon_rate_bps, issue_date, maturity_date,
			coupon_frequency_per_year, reinvestment_cutoff_date
		)
		select
			new_asset.id, $6, $7, $8, $9, $10, $11, $12, $13
		from new_asset
		returning asset_id,
		          $1::text as user_id,
		          $3::text as name,
		          $4::text as symbol,
		          $5::text as currency,
		          coalesce(cash_account_id::text, '') as cash_account_id,
		          principal_minor,
		          purchase_fee_minor,
		          coupon_rate_bps,
		          issue_date::text,
		          maturity_date::text,
		          coupon_frequency_per_year,
		          reinvestment_cutoff_date::text,
		          created_at::text,
		          updated_at::text
	`, userID, bondTypeID, strings.TrimSpace(input.Name), symbol, input.Currency, nullableAccountID(input.CashAccountID), input.PrincipalMinor, input.PurchaseFeeMinor, input.CouponRateBps, input.IssueDate, input.MaturityDate, input.CouponFrequencyPerYear, input.ReinvestmentCutoffDate).Scan(
		&position.AssetID,
		&position.UserID,
		&position.Name,
		&position.Symbol,
		&position.Currency,
		&position.CashAccountID,
		&position.PrincipalMinor,
		&position.PurchaseFeeMinor,
		&position.CouponRateBps,
		&position.IssueDate,
		&position.MaturityDate,
		&position.CouponFrequencyPerYear,
		&position.ReinvestmentCutoffDate,
		&position.CreatedAt,
		&position.UpdatedAt,
	)
	if err != nil {
		return BondPosition{}, normalizeWriteError(err)
	}

	purchaseNote := fmt.Sprintf("Purchased government bond %s", position.Name)
	purchaseAccountID := any(input.CashAccountID)
	purchaseSource := "manual"
	if input.HistoricalBackfill {
		purchaseAccountID = nil
		purchaseSource = "historical_backfill"
	}
	if _, err := tx.Exec(ctx, `
		insert into transactions (
			user_id, transaction_date, entry_kind, amount, currency, account_id, asset_id,
			quantity, unit_price, fees, note, source
		) values ($1, $2, 'investment_buy', $3, $4, $5, $6, 1, $7, $8, $9, $10)
	`, userID, input.IssueDate, input.PrincipalMinor+input.PurchaseFeeMinor, input.Currency,
		purchaseAccountID, position.AssetID, input.PrincipalMinor, input.PurchaseFeeMinor, purchaseNote, purchaseSource); err != nil {
		return BondPosition{}, err
	}

	for _, cashflow := range buildBondCashflows(position.AssetID, input.CashAccountID, input.PrincipalMinor, input.CouponRateBps, input.CouponFrequencyPerYear, issueDate, maturityDate, cutoffDate) {
		if _, err := tx.Exec(ctx, `
			insert into bond_cashflows (
				asset_id, cash_account_id, event_type, disposition, scheduled_date, gross_amount_minor, net_amount_minor, status
			) values ($1, $2, $3, $4, $5, $6, $7, 'projected')
		`, cashflow.AssetID, nullableAccountID(cashflow.CashAccountID), cashflow.EventType, cashflow.Disposition, cashflow.ScheduledDate, cashflow.GrossAmountMinor, cashflow.NetAmountMinor); err != nil {
			return BondPosition{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return BondPosition{}, err
	}

	return position, nil
}

func (s *BondStore) AddPurchase(ctx context.Context, userID, assetID string, input AddBondPurchaseInput) (BondPosition, error) {
	if err := validateAddBondPurchaseInput(input); err != nil {
		return BondPosition{}, err
	}

	purchaseDate, _ := time.Parse(dateLayout, input.PurchaseDate)
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return BondPosition{}, err
	}
	defer tx.Rollback(ctx)

	var position BondPosition
	err = tx.QueryRow(ctx, `
		select bp.asset_id, a.user_id, a.name, a.symbol, a.currency, coalesce(bp.cash_account_id::text, '') as cash_account_id,
		       bp.principal_minor, bp.purchase_fee_minor, bp.coupon_rate_bps,
		       bp.issue_date::text, bp.maturity_date::text, bp.coupon_frequency_per_year,
		       bp.reinvestment_cutoff_date::text, bp.created_at::text, bp.updated_at::text
		from bond_positions bp
		join assets a on a.id = bp.asset_id
		where bp.asset_id = $1 and a.user_id = $2
		for update
	`, assetID, userID).Scan(
		&position.AssetID, &position.UserID, &position.Name, &position.Symbol, &position.Currency,
		&position.CashAccountID, &position.PrincipalMinor, &position.PurchaseFeeMinor,
		&position.CouponRateBps, &position.IssueDate, &position.MaturityDate,
		&position.CouponFrequencyPerYear, &position.ReinvestmentCutoffDate,
		&position.CreatedAt, &position.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return BondPosition{}, ErrNotFound
	}
	if err != nil {
		return BondPosition{}, err
	}

	issueDate, _ := time.Parse(dateLayout, position.IssueDate)
	maturityDate, _ := time.Parse(dateLayout, position.MaturityDate)
	if purchaseDate.Before(issueDate) {
		return BondPosition{}, errors.New("purchaseDate must be on or after the bond issue date")
	}
	if !purchaseDate.Before(maturityDate) {
		return BondPosition{}, errors.New("purchaseDate must be before the bond maturity date")
	}

	if !input.HistoricalBackfill {
		var accountExists bool
		if err := tx.QueryRow(ctx, `
			select exists(
				select 1 from accounts
				where id = $1 and user_id = $2 and archived_at is null
				  and account_class <> 'liability' and currency = $3
			)
		`, input.CashAccountID, userID, position.Currency).Scan(&accountExists); err != nil {
			return BondPosition{}, err
		}
		if !accountExists {
			return BondPosition{}, ErrNotFound
		}
	}

	var redemptionProjected bool
	if err := tx.QueryRow(ctx, `
		select exists(
			select 1 from bond_cashflows
			where asset_id = $1 and event_type = 'principal_redemption' and status = 'projected'
		)
	`, assetID).Scan(&redemptionProjected); err != nil {
		return BondPosition{}, err
	}
	if !redemptionProjected {
		return BondPosition{}, ErrConflict
	}

	couponIncrease := roundedCouponMinor(input.PrincipalMinor, position.CouponRateBps, position.CouponFrequencyPerYear)
	if _, err := tx.Exec(ctx, `
		update bond_cashflows
		set gross_amount_minor = gross_amount_minor + $2,
		    net_amount_minor = net_amount_minor + $2,
		    updated_at = now()
		where asset_id = $1 and event_type = 'coupon' and status = 'projected' and scheduled_date >= $3
	`, assetID, couponIncrease, input.PurchaseDate); err != nil {
		return BondPosition{}, err
	}
	if _, err := tx.Exec(ctx, `
		update bond_cashflows
		set gross_amount_minor = gross_amount_minor + $2,
		    net_amount_minor = net_amount_minor + $2,
		    updated_at = now()
		where asset_id = $1 and event_type = 'principal_redemption' and status = 'projected'
	`, assetID, input.PrincipalMinor); err != nil {
		return BondPosition{}, err
	}

	purchaseAccountID := any(input.CashAccountID)
	purchaseSource := "manual"
	if input.HistoricalBackfill {
		purchaseAccountID = nil
		purchaseSource = "historical_backfill"
	}
	note := strings.TrimSpace(input.Note)
	if note == "" {
		note = fmt.Sprintf("Added to government bond %s", position.Name)
	}
	if _, err := tx.Exec(ctx, `
		insert into transactions (
			user_id, transaction_date, entry_kind, amount, currency, account_id, asset_id,
			quantity, unit_price, fees, note, source
		) values ($1, $2, 'investment_buy', $3, $4, $5, $6, 1, $7, $8, $9, $10)
	`, userID, input.PurchaseDate, input.PrincipalMinor+input.PurchaseFeeMinor, position.Currency,
		purchaseAccountID, assetID, input.PrincipalMinor, input.PurchaseFeeMinor, note, purchaseSource); err != nil {
		return BondPosition{}, err
	}

	err = tx.QueryRow(ctx, `
		update bond_positions
		set principal_minor = principal_minor + $2,
		    purchase_fee_minor = purchase_fee_minor + $3,
		    updated_at = now()
		where asset_id = $1
		returning principal_minor, purchase_fee_minor, updated_at::text
	`, assetID, input.PrincipalMinor, input.PurchaseFeeMinor).Scan(
		&position.PrincipalMinor, &position.PurchaseFeeMinor, &position.UpdatedAt,
	)
	if err != nil {
		return BondPosition{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return BondPosition{}, err
	}
	return position, nil
}

func (s *BondStore) ListByUser(ctx context.Context, userID string) ([]BondPosition, error) {
	rows, err := s.db.Query(ctx, `
		select bp.asset_id, a.user_id, a.name, a.symbol, a.currency, coalesce(bp.cash_account_id::text, '') as cash_account_id, bp.principal_minor, bp.purchase_fee_minor,
		       bp.coupon_rate_bps, bp.issue_date::text, bp.maturity_date::text, bp.coupon_frequency_per_year,
		       bp.reinvestment_cutoff_date::text, bp.created_at::text, bp.updated_at::text
		from bond_positions bp
		join assets a on a.id = bp.asset_id
		where a.user_id = $1
		order by bp.maturity_date asc, a.name asc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	positions := make([]BondPosition, 0)
	for rows.Next() {
		var position BondPosition
		if err := rows.Scan(
			&position.AssetID,
			&position.UserID,
			&position.Name,
			&position.Symbol,
			&position.Currency,
			&position.CashAccountID,
			&position.PrincipalMinor,
			&position.PurchaseFeeMinor,
			&position.CouponRateBps,
			&position.IssueDate,
			&position.MaturityDate,
			&position.CouponFrequencyPerYear,
			&position.ReinvestmentCutoffDate,
			&position.CreatedAt,
			&position.UpdatedAt,
		); err != nil {
			return nil, err
		}
		positions = append(positions, position)
	}

	return positions, rows.Err()
}

func (s *BondStore) GetProjection(ctx context.Context, userID, assetID string) (BondProjection, error) {
	var projection BondProjection
	err := s.db.QueryRow(ctx, `
		select bp.asset_id, a.user_id, a.name, a.symbol, a.currency, coalesce(bp.cash_account_id::text, '') as cash_account_id, bp.principal_minor, bp.purchase_fee_minor,
		       bp.coupon_rate_bps, bp.issue_date::text, bp.maturity_date::text, bp.coupon_frequency_per_year,
		       bp.reinvestment_cutoff_date::text, bp.created_at::text, bp.updated_at::text
		from bond_positions bp
		join assets a on a.id = bp.asset_id
		where bp.asset_id = $1 and a.user_id = $2
	`, assetID, userID).Scan(
		&projection.Bond.AssetID,
		&projection.Bond.UserID,
		&projection.Bond.Name,
		&projection.Bond.Symbol,
		&projection.Bond.Currency,
		&projection.Bond.CashAccountID,
		&projection.Bond.PrincipalMinor,
		&projection.Bond.PurchaseFeeMinor,
		&projection.Bond.CouponRateBps,
		&projection.Bond.IssueDate,
		&projection.Bond.MaturityDate,
		&projection.Bond.CouponFrequencyPerYear,
		&projection.Bond.ReinvestmentCutoffDate,
		&projection.Bond.CreatedAt,
		&projection.Bond.UpdatedAt,
	)
	if err != nil {
		return BondProjection{}, normalizeWriteError(err)
	}

	rows, err := s.db.Query(ctx, `
		select id, asset_id, coalesce(cash_account_id::text, '') as cash_account_id, event_type, disposition, scheduled_date::text, gross_amount_minor,
		       tax_amount_minor, net_amount_minor, status, posted_transaction_id, destination_asset_id,
		       reinvest_transaction_id, payment_date::text, confirmed_at::text
		from bond_cashflows
		where asset_id = $1
		order by scheduled_date asc, event_type asc
	`, assetID)
	if err != nil {
		return BondProjection{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var cashflow BondCashflow
		if err := rows.Scan(
			&cashflow.ID,
			&cashflow.AssetID,
			&cashflow.CashAccountID,
			&cashflow.EventType,
			&cashflow.Disposition,
			&cashflow.ScheduledDate,
			&cashflow.GrossAmountMinor,
			&cashflow.TaxAmountMinor,
			&cashflow.NetAmountMinor,
			&cashflow.Status,
			&cashflow.PostedTransactionID,
			&cashflow.DestinationAssetID,
			&cashflow.ReinvestTransactionID,
			&cashflow.PaymentDate,
			&cashflow.ConfirmedAt,
		); err != nil {
			return BondProjection{}, err
		}

		projection.Cashflows = append(projection.Cashflows, cashflow)
		projection.TotalProjectedPayoutMinor += cashflow.NetAmountMinor
		if cashflow.EventType == "coupon" {
			projection.TotalGrossCouponMinor += cashflow.GrossAmountMinor
			projection.TotalCouponTaxMinor += cashflow.TaxAmountMinor
			projection.TotalCouponMinor += cashflow.NetAmountMinor
			// Posted means the money was actually paid, which is the only part
			// that can be called a gain.
			if cashflow.Status == "posted" {
				projection.CouponGrossReceivedMinor += cashflow.GrossAmountMinor
				projection.CouponTaxWithheldMinor += cashflow.TaxAmountMinor
				projection.CouponNetReceivedMinor += cashflow.NetAmountMinor
				projection.CouponsReceivedCount++
			}
		}
		if cashflow.Disposition == "cash_balance" {
			projection.TotalCashBalanceMinor += cashflow.NetAmountMinor
		}
		if cashflow.Disposition == "reinvest" {
			projection.TotalReinvestedMinor += cashflow.NetAmountMinor
		}
	}

	return projection, rows.Err()
}

func (s *BondStore) ConfirmCoupon(ctx context.Context, userID, assetID string, input ConfirmBondCouponInput) (BondCashflow, error) {
	netAmountMinor, quantity, err := validateCouponConfirmation(input)
	if err != nil {
		return BondCashflow{}, err
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return BondCashflow{}, err
	}
	defer tx.Rollback(ctx)

	var eventType, status, currency, bondName string
	err = tx.QueryRow(ctx, `
		select bc.event_type, bc.status, a.currency, a.name
		from bond_cashflows bc
		join assets a on a.id = bc.asset_id
		where bc.id = $1 and bc.asset_id = $2 and a.user_id = $3
		for update
	`, input.CashflowID, assetID, userID).Scan(&eventType, &status, &currency, &bondName)
	if errors.Is(err, pgx.ErrNoRows) {
		return BondCashflow{}, ErrNotFound
	}
	if err != nil {
		return BondCashflow{}, err
	}
	if eventType != "coupon" {
		return BondCashflow{}, errors.New("only coupon cashflows can be confirmed")
	}
	if status != "projected" {
		return BondCashflow{}, ErrConflict
	}

	cashAccountID := input.CashAccountID
	transactionSource := "manual"
	if input.HistoricalBackfill {
		cashAccountID = ""
		transactionSource = "historical_backfill"
	}

	if !input.HistoricalBackfill {
		var accountCurrency, accountClass, accountType string
		err = tx.QueryRow(ctx, `
		select currency, account_class, account_type
		from accounts
		where id = $1 and user_id = $2 and archived_at is null
	`, cashAccountID, userID).Scan(&accountCurrency, &accountClass, &accountType)
		if errors.Is(err, pgx.ErrNoRows) {
			return BondCashflow{}, ErrNotFound
		}
		if err != nil {
			return BondCashflow{}, err
		}
		if accountClass != "asset" || accountType == "receivable" || accountCurrency != currency {
			return BondCashflow{}, errors.New("coupon account must be an active asset account in the bond currency")
		}
	}

	incomeNote := fmt.Sprintf("Net bond coupon from %s (gross %d, withholding tax %d)", bondName, input.GrossAmountMinor, input.TaxAmountMinor)
	var incomeTransactionID string
	err = tx.QueryRow(ctx, `
		insert into transactions (
			user_id, transaction_date, entry_kind, amount, currency, account_id, asset_id,
			note, source, origin_event_id, origin_event_type
		) values ($1, $2, 'investment_income', $3, $4, $5, $6, $7, $8, $9, 'bond_coupon_confirmation')
		returning id
	`, userID, input.PaymentDate, netAmountMinor, currency, nullableAccountID(cashAccountID), assetID,
		incomeNote, transactionSource, input.CashflowID).Scan(&incomeTransactionID)
	if err != nil {
		return BondCashflow{}, err
	}

	disposition := "cash_balance"
	if input.HistoricalBackfill {
		disposition = "historical_cash"
	}
	var destinationAssetID *string
	var reinvestTransactionID *string
	if input.Destination == "stock" {
		var targetName, targetClass, targetCurrency string
		err = tx.QueryRow(ctx, `
			select name, asset_class, currency
			from assets
			where id = $1 and user_id = $2
		`, input.DestinationAssetID, userID).Scan(&targetName, &targetClass, &targetCurrency)
		if errors.Is(err, pgx.ErrNoRows) {
			return BondCashflow{}, ErrNotFound
		}
		if err != nil {
			return BondCashflow{}, err
		}
		if targetClass != "stock" || targetCurrency != currency {
			return BondCashflow{}, errors.New("coupon reinvestment must use a stock in the bond currency")
		}

		reinvestNote := fmt.Sprintf("Reinvested coupon from %s into %s", bondName, targetName)
		var transactionID string
		err = tx.QueryRow(ctx, `
			insert into transactions (
				user_id, transaction_date, entry_kind, amount, currency, account_id, asset_id,
				quantity, unit_price, fees, note, source, origin_event_id, origin_event_type
			) values ($1, $2, 'investment_buy', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'bond_coupon_reinvestment')
			returning id
		`, userID, input.PaymentDate, netAmountMinor, currency, nullableAccountID(cashAccountID),
			input.DestinationAssetID, quantity, input.UnitPriceMinor, input.PurchaseFeeMinor,
			reinvestNote, transactionSource, input.CashflowID).Scan(&transactionID)
		if err != nil {
			return BondCashflow{}, err
		}

		if _, err := createAssetLot(ctx, tx, AssetLot{
			UserID:            userID,
			AssetID:           input.DestinationAssetID,
			TransactionID:     &transactionID,
			Quantity:          quantity,
			RemainingQuantity: quantity,
			UnitPrice:         input.UnitPriceMinor,
			Fees:              input.PurchaseFeeMinor,
			TotalCost:         netAmountMinor,
			AcquisitionDate:   input.PaymentDate,
		}); err != nil {
			return BondCashflow{}, err
		}

		disposition = "reinvest"
		destinationAssetID = &input.DestinationAssetID
		reinvestTransactionID = &transactionID
	}

	var result BondCashflow
	err = tx.QueryRow(ctx, `
		update bond_cashflows
		set cash_account_id = $1,
		    disposition = $2,
		    gross_amount_minor = $3,
		    tax_amount_minor = $4,
		    net_amount_minor = $5,
		    status = 'posted',
		    posted_transaction_id = $6,
		    destination_asset_id = $7,
		    reinvest_transaction_id = $8,
		    payment_date = $9,
		    confirmed_at = now(),
		    updated_at = now()
		where id = $10 and status = 'projected'
		returning id, asset_id, coalesce(cash_account_id::text, '') as cash_account_id, event_type, disposition, scheduled_date::text,
		          gross_amount_minor, tax_amount_minor, net_amount_minor, status, posted_transaction_id,
		          destination_asset_id, reinvest_transaction_id, payment_date::text, confirmed_at::text
	`, nullableAccountID(cashAccountID), disposition, input.GrossAmountMinor, input.TaxAmountMinor, netAmountMinor,
		incomeTransactionID, destinationAssetID, reinvestTransactionID, input.PaymentDate, input.CashflowID).Scan(
		&result.ID,
		&result.AssetID,
		&result.CashAccountID,
		&result.EventType,
		&result.Disposition,
		&result.ScheduledDate,
		&result.GrossAmountMinor,
		&result.TaxAmountMinor,
		&result.NetAmountMinor,
		&result.Status,
		&result.PostedTransactionID,
		&result.DestinationAssetID,
		&result.ReinvestTransactionID,
		&result.PaymentDate,
		&result.ConfirmedAt,
	)
	if err != nil {
		return BondCashflow{}, normalizeWriteError(err)
	}

	if err := tx.Commit(ctx); err != nil {
		return BondCashflow{}, err
	}
	return result, nil
}

func (s *BondStore) PostDueCashflows(ctx context.Context, userID string, asOf time.Time) error {
	rows, err := s.db.Query(ctx, `
		select bc.id, bc.asset_id, bc.cash_account_id, bc.event_type, bc.disposition, bc.scheduled_date::text,
		       bc.net_amount_minor, a.name, a.currency
		from bond_cashflows bc
		join assets a on a.id = bc.asset_id
		where a.user_id = $1
		  and bc.status = 'projected'
		  and bc.scheduled_date <= $2
		  and bc.event_type = 'principal_redemption'
		  -- A historical bond may have no account to credit. Its redemption stays
		  -- projected until one is chosen rather than posting to nowhere.
		  and bc.cash_account_id is not null
		order by bc.scheduled_date asc, bc.created_at asc
	`, userID, asOf.Format(dateLayout))
	if err != nil {
		return err
	}
	defer rows.Close()

	type dueCashflow struct {
		ID             string
		AssetID        string
		CashAccountID  string
		EventType      string
		Disposition    string
		ScheduledDate  string
		NetAmountMinor int64
		AssetName      string
		Currency       string
	}

	due := make([]dueCashflow, 0)
	for rows.Next() {
		var item dueCashflow
		if err := rows.Scan(&item.ID, &item.AssetID, &item.CashAccountID, &item.EventType, &item.Disposition, &item.ScheduledDate, &item.NetAmountMinor, &item.AssetName, &item.Currency); err != nil {
			return err
		}
		due = append(due, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(due) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, item := range due {
		entryKind := "investment_income"
		note := fmt.Sprintf("Bond coupon from %s", item.AssetName)
		if item.EventType == "principal_redemption" {
			entryKind = "bond_principal_redemption"
			note = fmt.Sprintf("Bond principal redemption from %s", item.AssetName)
		}

		var postedTransactionID string
		err := tx.QueryRow(ctx, `
			insert into transactions (
				user_id, transaction_date, entry_kind, amount, currency, account_id, asset_id, note, source
			) values ($1, $2, $3, $4, $5, $6, $7, $8, 'adjustment')
			returning id
		`, userID, item.ScheduledDate, entryKind, item.NetAmountMinor, item.Currency, item.CashAccountID, item.AssetID, note).Scan(&postedTransactionID)
		if err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, `
			update bond_cashflows
			set status = 'posted', posted_transaction_id = $1, updated_at = now()
			where id = $2 and status = 'projected'
		`, postedTransactionID, item.ID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func validateCouponConfirmation(input ConfirmBondCouponInput) (int64, float64, error) {
	if strings.TrimSpace(input.CashflowID) == "" {
		return 0, 0, errors.New("cashflowId is required")
	}
	if !input.HistoricalBackfill && strings.TrimSpace(input.CashAccountID) == "" {
		return 0, 0, errors.New("cashAccountId is required")
	}
	if input.GrossAmountMinor <= 0 {
		return 0, 0, errors.New("grossAmountMinor must be greater than zero")
	}
	if input.TaxAmountMinor < 0 || input.TaxAmountMinor > input.GrossAmountMinor {
		return 0, 0, errors.New("taxAmountMinor must be between zero and the gross coupon")
	}
	if _, err := time.Parse(dateLayout, input.PaymentDate); err != nil {
		return 0, 0, errors.New("paymentDate must use YYYY-MM-DD")
	}

	netAmountMinor := input.GrossAmountMinor - input.TaxAmountMinor
	switch input.Destination {
	case "", "cash":
		return netAmountMinor, 0, nil
	case "stock":
		// A live coupon lands in the settlement account first. Buying the stock
		// is a separate decision made at the broker, on its own date and at its
		// own price, so it is recorded as its own purchase rather than assumed
		// here. Only a historical coupon, where both legs already happened, can
		// be booked in one step.
		if !input.HistoricalBackfill {
			return 0, 0, errors.New("a coupon is paid into the settlement account; record the reinvestment as a stock purchase once the money has arrived")
		}
		if strings.TrimSpace(input.DestinationAssetID) == "" {
			return 0, 0, errors.New("destinationAssetId is required for stock reinvestment")
		}
		if input.UnitPriceMinor <= 0 {
			return 0, 0, errors.New("unitPriceMinor must be greater than zero for stock reinvestment")
		}
		if input.PurchaseFeeMinor < 0 || input.PurchaseFeeMinor >= netAmountMinor {
			return 0, 0, errors.New("purchaseFeeMinor must be non-negative and less than the net coupon")
		}
		quantity := float64(netAmountMinor-input.PurchaseFeeMinor) / float64(input.UnitPriceMinor)
		if quantity < 0.000001 {
			return 0, 0, errors.New("net coupon is too small to buy a stock unit at that price")
		}
		return netAmountMinor, quantity, nil
	default:
		return 0, 0, errors.New("destination must be cash or stock")
	}
}

func buildBondCashflows(assetID, cashAccountID string, principalMinor int64, couponRateBps, frequency int, issueDate, maturityDate, cutoffDate time.Time) []BondCashflow {
	monthsPerCoupon := 12 / frequency
	couponMinor := roundedCouponMinor(principalMinor, couponRateBps, frequency)

	cashflows := make([]BondCashflow, 0)
	for next := issueDate.AddDate(0, monthsPerCoupon, 0); !next.After(maturityDate); next = next.AddDate(0, monthsPerCoupon, 0) {
		disposition := "reinvest"
		if !next.Before(cutoffDate) {
			disposition = "cash_balance"
		}

		cashflows = append(cashflows, BondCashflow{
			AssetID:          assetID,
			CashAccountID:    cashAccountID,
			EventType:        "coupon",
			Disposition:      disposition,
			ScheduledDate:    next.Format(dateLayout),
			GrossAmountMinor: couponMinor,
			NetAmountMinor:   couponMinor,
			Status:           "projected",
		})
	}

	cashflows = append(cashflows, BondCashflow{
		AssetID:          assetID,
		CashAccountID:    cashAccountID,
		EventType:        "principal_redemption",
		Disposition:      "cash_balance",
		ScheduledDate:    maturityDate.Format(dateLayout),
		GrossAmountMinor: principalMinor,
		NetAmountMinor:   principalMinor,
		Status:           "projected",
	})

	return cashflows
}

func findOrCreateBondInvestmentType(ctx context.Context, tx pgx.Tx, userID string) (string, error) {
	var investmentTypeID string
	err := tx.QueryRow(ctx, `
		select id
		from investment_types
		where user_id = $1 and code = 'bond'
	`, userID).Scan(&investmentTypeID)
	if err == nil {
		return investmentTypeID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	err = tx.QueryRow(ctx, `
		insert into investment_types (user_id, name, code, model_kind, is_system)
		values ($1, 'Bond', 'bond', 'asset', true)
		returning id
	`, userID).Scan(&investmentTypeID)
	return investmentTypeID, normalizeWriteError(err)
}

func normalizeAssetSymbol(name string, symbol *string) string {
	value := strings.TrimSpace(name)
	if symbol != nil && strings.TrimSpace(*symbol) != "" {
		value = strings.TrimSpace(*symbol)
	}

	value = strings.ToUpper(strings.ReplaceAll(value, " ", "_"))
	if value == "" {
		return "BOND"
	}
	return value
}

func roundedCouponMinor(principalMinor int64, couponRateBps, frequency int) int64 {
	if principalMinor <= 0 || couponRateBps <= 0 || frequency <= 0 {
		return 0
	}

	denominator := int64(10000 * frequency)
	numerator := principalMinor * int64(couponRateBps)
	return (numerator + denominator/2) / denominator
}

func validateBondInput(input CreateBondInput) error {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return errors.New("name is required")
	}
	if !input.HistoricalBackfill && strings.TrimSpace(input.CashAccountID) == "" {
		return errors.New("cashAccountId is required")
	}
	if input.PrincipalMinor <= 0 {
		return errors.New("principalMinor must be greater than zero")
	}
	if input.PurchaseFeeMinor < 0 {
		return errors.New("purchaseFeeMinor must be zero or greater")
	}
	if input.PurchaseFeeMinor > int64(^uint64(0)>>1)-input.PrincipalMinor {
		return errors.New("principalMinor plus purchaseFeeMinor is too large")
	}
	if input.CouponRateBps < 0 {
		return errors.New("couponRateBps must be zero or greater")
	}
	if input.CouponFrequencyPerYear == 0 {
		input.CouponFrequencyPerYear = 2
	}
	if input.CouponFrequencyPerYear <= 0 || 12%input.CouponFrequencyPerYear != 0 {
		return errors.New("couponFrequencyPerYear must divide 12")
	}

	issueDate, err := time.Parse(dateLayout, input.IssueDate)
	if err != nil {
		return errors.New("issueDate must use YYYY-MM-DD")
	}
	maturityDate, err := time.Parse(dateLayout, input.MaturityDate)
	if err != nil {
		return errors.New("maturityDate must use YYYY-MM-DD")
	}
	cutoffDate, err := time.Parse(dateLayout, input.ReinvestmentCutoffDate)
	if err != nil {
		return errors.New("reinvestmentCutoffDate must use YYYY-MM-DD")
	}
	if !maturityDate.After(issueDate) {
		return errors.New("maturityDate must be after issueDate")
	}
	if cutoffDate.Before(issueDate) {
		return errors.New("reinvestmentCutoffDate must be on or after issueDate")
	}
	if cutoffDate.After(maturityDate) {
		return errors.New("reinvestmentCutoffDate must be on or before maturityDate")
	}

	return nil
}

func validateAddBondPurchaseInput(input AddBondPurchaseInput) error {
	if !input.HistoricalBackfill && strings.TrimSpace(input.CashAccountID) == "" {
		return errors.New("cashAccountId is required")
	}
	if input.PrincipalMinor <= 0 {
		return errors.New("principalMinor must be greater than zero")
	}
	if input.PurchaseFeeMinor < 0 {
		return errors.New("purchaseFeeMinor must be zero or greater")
	}
	if input.PurchaseFeeMinor > int64(^uint64(0)>>1)-input.PrincipalMinor {
		return errors.New("principalMinor plus purchaseFeeMinor is too large")
	}
	if _, err := time.Parse(dateLayout, input.PurchaseDate); err != nil {
		return errors.New("purchaseDate must use YYYY-MM-DD")
	}
	return nil
}

const dateLayout = "2006-01-02"
