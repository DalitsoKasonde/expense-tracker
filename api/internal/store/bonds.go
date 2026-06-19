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
	CouponRateBps          int     `json:"couponRateBps"`
	IssueDate              string  `json:"issueDate"`
	MaturityDate           string  `json:"maturityDate"`
	CouponFrequencyPerYear int     `json:"couponFrequencyPerYear"`
	ReinvestmentCutoffDate string  `json:"reinvestmentCutoffDate"`
	CreatedAt              string  `json:"createdAt"`
	UpdatedAt              string  `json:"updatedAt"`
}

type BondCashflow struct {
	ID                  string  `json:"id"`
	AssetID             string  `json:"assetId"`
	CashAccountID       string  `json:"cashAccountId"`
	EventType           string  `json:"eventType"`
	Disposition         string  `json:"disposition"`
	ScheduledDate       string  `json:"scheduledDate"`
	GrossAmountMinor    int64   `json:"grossAmountMinor"`
	NetAmountMinor      int64   `json:"netAmountMinor"`
	Status              string  `json:"status"`
	PostedTransactionID *string `json:"postedTransactionId"`
}

type BondProjection struct {
	Bond                      BondPosition   `json:"bond"`
	Cashflows                 []BondCashflow `json:"cashflows"`
	TotalProjectedPayoutMinor int64          `json:"totalProjectedPayoutMinor"`
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
	CouponRateBps          int     `json:"couponRateBps"`
	IssueDate              string  `json:"issueDate"`
	MaturityDate           string  `json:"maturityDate"`
	CouponFrequencyPerYear int     `json:"couponFrequencyPerYear"`
	ReinvestmentCutoffDate string  `json:"reinvestmentCutoffDate"`
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
			asset_id, cash_account_id, principal_minor, coupon_rate_bps, issue_date, maturity_date,
			coupon_frequency_per_year, reinvestment_cutoff_date
		)
		select
			new_asset.id, $6, $7, $8, $9, $10, $11, $12
		from new_asset
		returning asset_id,
		          $1::text as user_id,
		          $3::text as name,
		          $4::text as symbol,
		          $5::text as currency,
		          cash_account_id,
		          principal_minor,
		          coupon_rate_bps,
		          issue_date::text,
		          maturity_date::text,
		          coupon_frequency_per_year,
		          reinvestment_cutoff_date::text,
		          created_at::text,
		          updated_at::text
	`, userID, bondTypeID, strings.TrimSpace(input.Name), symbol, input.Currency, input.CashAccountID, input.PrincipalMinor, input.CouponRateBps, input.IssueDate, input.MaturityDate, input.CouponFrequencyPerYear, input.ReinvestmentCutoffDate).Scan(
		&position.AssetID,
		&position.UserID,
		&position.Name,
		&position.Symbol,
		&position.Currency,
		&position.CashAccountID,
		&position.PrincipalMinor,
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
		select bp.asset_id, a.user_id, a.name, a.symbol, a.currency, bp.cash_account_id, bp.principal_minor,
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
		select bp.asset_id, a.user_id, a.name, a.symbol, a.currency, bp.cash_account_id, bp.principal_minor,
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
		       net_amount_minor, status, posted_transaction_id
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
			&cashflow.NetAmountMinor,
			&cashflow.Status,
			&cashflow.PostedTransactionID,
		); err != nil {
			return BondProjection{}, err
		}

		projection.Cashflows = append(projection.Cashflows, cashflow)
		projection.TotalProjectedPayoutMinor += cashflow.NetAmountMinor
		if cashflow.EventType == "coupon" {
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

func (s *BondStore) PostDueCashflows(ctx context.Context, userID string, asOf time.Time) error {
	rows, err := s.db.Query(ctx, `
		select bc.id, bc.asset_id, bc.cash_account_id, bc.event_type, bc.disposition, bc.scheduled_date::text,
		       bc.net_amount_minor, a.name, a.currency
		from bond_cashflows bc
		join assets a on a.id = bc.asset_id
		where a.user_id = $1
		  and bc.status = 'projected'
		  and bc.scheduled_date <= $2
		  and (bc.event_type = 'principal_redemption' or bc.disposition = 'cash_balance')
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
