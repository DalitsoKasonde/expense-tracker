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
		          cash_account_id,
		          principal_minor,
		          purchase_fee_minor,
		          coupon_rate_bps,
		          issue_date::text,
		          maturity_date::text,
		          coupon_frequency_per_year,
		          reinvestment_cutoff_date::text,
		          created_at::text,
		          updated_at::text
	`, userID, bondTypeID, strings.TrimSpace(input.Name), symbol, input.Currency, input.CashAccountID, input.PrincipalMinor, input.PurchaseFeeMinor, input.CouponRateBps, input.IssueDate, input.MaturityDate, input.CouponFrequencyPerYear, input.ReinvestmentCutoffDate).Scan(
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
	if _, err := tx.Exec(ctx, `
		insert into transactions (
			user_id, transaction_date, entry_kind, amount, currency, account_id, asset_id,
			quantity, unit_price, fees, note, source
		) values ($1, $2, 'investment_buy', $3, $4, $5, $6, 1, $7, $8, $9, 'manual')
	`, userID, input.IssueDate, input.PrincipalMinor+input.PurchaseFeeMinor, input.Currency,
		input.CashAccountID, position.AssetID, input.PrincipalMinor, input.PurchaseFeeMinor, purchaseNote); err != nil {
		return BondPosition{}, err
	}

	for _, cashflow := range buildBondCashflows(position.AssetID, input.CashAccountID, input.PrincipalMinor, input.CouponRateBps, input.CouponFrequencyPerYear, issueDate, maturityDate, cutoffDate) {
		if _, err := tx.Exec(ctx, `
			insert into bond_cashflows (
				asset_id, cash_account_id, event_type, disposition, scheduled_date, gross_amount_minor, net_amount_minor, status
			) values ($1, $2, $3, $4, $5, $6, $7, 'projected')
		`, cashflow.AssetID, cashflow.CashAccountID, cashflow.EventType, cashflow.Disposition, cashflow.ScheduledDate, cashflow.GrossAmountMinor, cashflow.NetAmountMinor); err != nil {
			return BondPosition{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return BondPosition{}, err
	}

	return position, nil
}

func (s *BondStore) ListByUser(ctx context.Context, userID string) ([]BondPosition, error) {
	rows, err := s.db.Query(ctx, `
		select bp.asset_id, a.user_id, a.name, a.symbol, a.currency, bp.cash_account_id, bp.principal_minor, bp.purchase_fee_minor,
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
		select bp.asset_id, a.user_id, a.name, a.symbol, a.currency, bp.cash_account_id, bp.principal_minor, bp.purchase_fee_minor,
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
		select id, asset_id, cash_account_id, event_type, disposition, scheduled_date::text, gross_amount_minor,
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

	var accountCurrency, accountClass, accountType string
	err = tx.QueryRow(ctx, `
		select currency, account_class, account_type
		from accounts
		where id = $1 and user_id = $2 and archived_at is null
	`, input.CashAccountID, userID).Scan(&accountCurrency, &accountClass, &accountType)
	if errors.Is(err, pgx.ErrNoRows) {
		return BondCashflow{}, ErrNotFound
	}
	if err != nil {
		return BondCashflow{}, err
	}
	if accountClass != "asset" || accountType == "receivable" || accountCurrency != currency {
		return BondCashflow{}, errors.New("coupon account must be an active asset account in the bond currency")
	}

	incomeNote := fmt.Sprintf("Net bond coupon from %s (gross %d, withholding tax %d)", bondName, input.GrossAmountMinor, input.TaxAmountMinor)
	var incomeTransactionID string
	err = tx.QueryRow(ctx, `
		insert into transactions (
			user_id, transaction_date, entry_kind, amount, currency, account_id, asset_id,
			note, source, origin_event_id, origin_event_type
		) values ($1, $2, 'investment_income', $3, $4, $5, $6, $7, 'manual', $8, 'bond_coupon_confirmation')
		returning id
	`, userID, input.PaymentDate, netAmountMinor, currency, input.CashAccountID, assetID,
		incomeNote, input.CashflowID).Scan(&incomeTransactionID)
	if err != nil {
		return BondCashflow{}, err
	}

	disposition := "cash_balance"
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
			) values ($1, $2, 'investment_buy', $3, $4, $5, $6, $7, $8, $9, $10, 'manual', $11, 'bond_coupon_reinvestment')
			returning id
		`, userID, input.PaymentDate, netAmountMinor, currency, input.CashAccountID,
			input.DestinationAssetID, quantity, input.UnitPriceMinor, input.PurchaseFeeMinor,
			reinvestNote, input.CashflowID).Scan(&transactionID)
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
		returning id, asset_id, cash_account_id, event_type, disposition, scheduled_date::text,
		          gross_amount_minor, tax_amount_minor, net_amount_minor, status, posted_transaction_id,
		          destination_asset_id, reinvest_transaction_id, payment_date::text, confirmed_at::text
	`, input.CashAccountID, disposition, input.GrossAmountMinor, input.TaxAmountMinor, netAmountMinor,
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
	if strings.TrimSpace(input.CashAccountID) == "" {
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
	if strings.TrimSpace(input.CashAccountID) == "" {
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

const dateLayout = "2006-01-02"
