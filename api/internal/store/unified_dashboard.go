package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DashboardAccountBalance struct {
	AccountID    string `json:"accountId"`
	Name         string `json:"name"`
	AccountType  string `json:"accountType"`
	AccountClass string `json:"accountClass"`
	Currency     string `json:"currency"`
	BalanceMinor int64  `json:"balanceMinor"`
}

type DashboardAsset struct {
	AssetID             string  `json:"assetId"`
	Name                string  `json:"name"`
	Symbol              *string `json:"symbol"`
	AssetClass          string  `json:"assetClass"`
	Currency            string  `json:"currency"`
	InvestedAmountMinor int64   `json:"investedAmountMinor"`
	CurrentValueMinor   int64   `json:"currentValueMinor"`
	HasPosition         bool    `json:"hasPosition"`
}

type UnifiedDashboard struct {
	AsOfDate         string                    `json:"asOfDate"`
	Currency         string                    `json:"currency"`
	Income           int64                     `json:"income"`
	Borrowed         int64                     `json:"borrowed"`
	InterestReceived int64                     `json:"interestReceived"`
	Expense          int64                     `json:"expense"`
	LivingExpense    int64                     `json:"livingExpense"`
	DebtInterestFees int64                     `json:"debtInterestFees"`
	DebtPrincipal    int64                     `json:"debtPrincipal"`
	Saving           int64                     `json:"saving"`
	Investment       int64                     `json:"investment"`
	TotalInflow      int64                     `json:"totalInflow"`
	OperatingBalance int64                     `json:"operatingBalance"`
	FreeCashFlow     int64                     `json:"freeCashFlow"`
	NetCashFlow      int64                     `json:"netCashFlow"`
	NetWorth         int64                     `json:"netWorth"`
	TotalAssets      int64                     `json:"totalAssets"`
	TotalLiabilities int64                     `json:"totalLiabilities"`
	CashBalance      int64                     `json:"cashBalance"`
	InvestmentValue  int64                     `json:"investmentValue"`
	AccountBalances  []DashboardAccountBalance `json:"accountBalances"`
	Assets           []DashboardAsset          `json:"assets"`
}

type UnifiedDashboardStore struct {
	db    *pgxpool.Pool
	bonds *BondStore
}

func NewUnifiedDashboardStore(db *pgxpool.Pool, bonds *BondStore) *UnifiedDashboardStore {
	return &UnifiedDashboardStore{
		db:    db,
		bonds: bonds,
	}
}

func (s *UnifiedDashboardStore) Get(ctx context.Context, userID, currency string, asOf time.Time) (UnifiedDashboard, error) {
	if currency == "" {
		currency = "ZMW"
	}
	if s.bonds != nil {
		if err := s.bonds.PostDueCashflows(ctx, userID, asOf); err != nil {
			return UnifiedDashboard{}, err
		}
	}

	dashboard := UnifiedDashboard{
		AsOfDate: asOf.Format(dateLayout),
		Currency: currency,
	}

	if err := s.db.QueryRow(ctx, `
		select
			coalesce(sum(case when entry_kind = 'income_earned' then amount else 0 end), 0)::bigint as income,
			coalesce(sum(case when entry_kind = 'income_borrowed' and account_id not in (select liability_account_id from loans where user_id = $1) then amount else 0 end), 0)::bigint as borrowed,
			coalesce(sum(case when entry_kind = 'investment_income' then amount else 0 end), 0)::bigint as interest_received,
			coalesce(sum(case when entry_kind = 'expense_living' then amount else 0 end), 0)::bigint as living_expense,
			coalesce(sum(case when entry_kind in ('expense_interest', 'expense_fee') then amount else 0 end), 0)::bigint as debt_interest_fees,
			coalesce(sum(case when entry_kind = 'debt_principal_payment' then amount else 0 end), 0)::bigint as debt_principal,
			coalesce(sum(
				case
					when entry_kind = 'saving_transfer'
						and dest.account_type = 'savings'
						and coalesce(src.account_type, '') <> 'savings'
					then amount
					when entry_kind = 'saving_transfer'
						and src.account_type = 'savings'
						and coalesce(dest.account_type, '') <> 'savings'
					then -amount
					else 0
				end
			), 0)::bigint as saving,
			coalesce(sum(case when entry_kind = 'investment_buy' then amount else 0 end), 0)::bigint as investment
		from transactions
		left join accounts src on src.id = transactions.account_id and src.user_id = transactions.user_id
		left join accounts dest on dest.id = transactions.destination_account_id and dest.user_id = transactions.user_id
		where transactions.user_id = $1
		  and transactions.currency = $2
		  and transactions.deleted_at is null
		  and transactions.transaction_date >= $3
		  and transactions.transaction_date <= $4
	`, userID, currency, time.Date(asOf.Year(), asOf.Month(), 1, 0, 0, 0, 0, asOf.Location()).Format(dateLayout), asOf.Format(dateLayout)).Scan(
		&dashboard.Income,
		&dashboard.Borrowed,
		&dashboard.InterestReceived,
		&dashboard.LivingExpense,
		&dashboard.DebtInterestFees,
		&dashboard.DebtPrincipal,
		&dashboard.Saving,
		&dashboard.Investment,
	); err != nil {
		return UnifiedDashboard{}, err
	}

	dashboard.Expense = dashboard.LivingExpense + dashboard.DebtInterestFees
	dashboard.TotalInflow = dashboard.Income + dashboard.Borrowed + dashboard.InterestReceived
	dashboard.OperatingBalance = dashboard.Income - dashboard.LivingExpense
	dashboard.FreeCashFlow = dashboard.Income - dashboard.LivingExpense - dashboard.DebtInterestFees - dashboard.DebtPrincipal
	dashboard.NetCashFlow = dashboard.TotalInflow - dashboard.Expense - dashboard.DebtPrincipal - dashboard.Saving - dashboard.Investment

	accountRows, err := s.db.Query(ctx, `
		select
			a.id,
			a.name,
			a.account_type,
			a.account_class,
			a.currency,
			(
					coalesce(a.opening_balance, 0)::bigint
				+ coalesce(sum(
					case
						when t.account_id = a.id then
								case
									when t.entry_kind in ('income_earned', 'income_borrowed', 'investment_income', 'investment_sell', 'bond_principal_redemption') then t.amount::bigint
									when t.entry_kind in ('expense_living', 'expense_interest', 'expense_fee', 'saving_transfer', 'investment_buy', 'investment_loss', 'debt_principal_payment') then -t.amount::bigint
									else 0
								end
						when t.destination_account_id = a.id and t.entry_kind = 'saving_transfer' then t.amount::bigint
						when t.destination_account_id = a.id and t.entry_kind = 'debt_principal_payment' then -t.amount::bigint
						else 0
					end
				), 0)
			) as balance_minor
		from accounts a
		left join transactions t
			on t.user_id = a.user_id
			and t.deleted_at is null
			and t.currency = a.currency
			and (t.account_id = a.id or t.destination_account_id = a.id)
			and t.transaction_date <= $3
		where a.user_id = $1
		  and a.archived_at is null
		  and a.currency = $2
		group by a.id, a.name, a.account_type, a.account_class, a.currency, a.opening_balance
		order by a.name asc
	`, userID, currency, asOf.Format(dateLayout))
	if err != nil {
		return UnifiedDashboard{}, err
	}
	defer accountRows.Close()

	for accountRows.Next() {
		var item DashboardAccountBalance
		if err := accountRows.Scan(&item.AccountID, &item.Name, &item.AccountType, &item.AccountClass, &item.Currency, &item.BalanceMinor); err != nil {
			return UnifiedDashboard{}, err
		}

		dashboard.AccountBalances = append(dashboard.AccountBalances, item)
		if item.AccountClass == "liability" {
			dashboard.TotalLiabilities += absInt64(item.BalanceMinor)
			continue
		}

		dashboard.CashBalance += item.BalanceMinor
	}
	if err := accountRows.Err(); err != nil {
		return UnifiedDashboard{}, err
	}

	assetRows, err := s.db.Query(ctx, `
		select
			a.id,
			a.name,
			a.symbol,
			a.asset_class,
			a.currency,
			case
				when a.asset_class = 'bond' then coalesce(bp.principal_minor, 0)
				else coalesce(lots.total_cost_minor, 0)
			end as invested_amount_minor,
			coalesce(
				latest.current_value_minor,
				case
					when a.asset_class = 'bond' and coalesce(redemption.is_redeemed, false) then 0
					when a.asset_class = 'bond' then coalesce(bp.principal_minor, 0)
					else coalesce(lots.total_cost_minor, 0)
				end
			) as current_value_minor,
			case
				when a.asset_class = 'bond' then bp.asset_id is not null
				else coalesce(lots.lot_count, 0) > 0
			end as has_position
		from assets a
		left join bond_positions bp on bp.asset_id = a.id
		left join lateral (
			select
				coalesce(sum(round(total_cost::numeric * remaining_quantity / nullif(quantity, 0))), 0)::bigint as total_cost_minor,
				count(*)::integer as lot_count
			from asset_lots
			where user_id = $1
			  and asset_id = a.id
			  and remaining_quantity > 0
		) lots on true
		left join lateral (
			select current_value_minor
			from asset_valuations
			where asset_id = a.id and currency = $2
			  and valuation_date <= $3
			order by valuation_date desc, created_at desc
			limit 1
		) latest on true
		left join lateral (
			select true as is_redeemed
			from bond_cashflows
			where asset_id = a.id
			  and event_type = 'principal_redemption'
			  and status = 'posted'
			limit 1
		) redemption on true
		where a.user_id = $1
		  and a.currency = $2
		order by a.name asc
	`, userID, currency, asOf.Format(dateLayout))
	if err != nil {
		return UnifiedDashboard{}, err
	}
	defer assetRows.Close()

	for assetRows.Next() {
		var item DashboardAsset
		if err := assetRows.Scan(
			&item.AssetID,
			&item.Name,
			&item.Symbol,
			&item.AssetClass,
			&item.Currency,
			&item.InvestedAmountMinor,
			&item.CurrentValueMinor,
			&item.HasPosition,
		); err != nil {
			return UnifiedDashboard{}, err
		}

		dashboard.Assets = append(dashboard.Assets, item)
		dashboard.InvestmentValue += item.CurrentValueMinor
	}
	if err := assetRows.Err(); err != nil {
		return UnifiedDashboard{}, err
	}

	dashboard.TotalAssets = dashboard.CashBalance + dashboard.InvestmentValue
	dashboard.NetWorth = dashboard.TotalAssets - dashboard.TotalLiabilities

	return dashboard, nil
}

func absInt64(value int64) int64 {
	if value < 0 {
		return -value
	}
	return value
}
