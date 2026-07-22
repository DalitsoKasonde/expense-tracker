package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
)

type monthlyInsight struct {
	Month                 int    `json:"month"`
	MonthLabel            string `json:"monthLabel"`
	EarnedIncome          int64  `json:"earnedIncome"`
	BorrowedIncome        int64  `json:"borrowedIncome"`
	TotalInflow           int64  `json:"totalInflow"`
	LivingExpenses        int64  `json:"livingExpenses"`
	DebtPrincipalPaid     int64  `json:"debtPrincipalPaid"`
	DebtInterestFees      int64  `json:"debtInterestFees"`
	Savings               int64  `json:"savings"`
	Investments           int64  `json:"investments"`
	OperatingBalance      int64  `json:"operatingBalance"`
	FreeCashFlow          int64  `json:"freeCashFlow"`
	AmountBroughtForward  int64  `json:"amountBroughtForward"`
	EndingCashBalance     int64  `json:"endingCashBalance"`
	NetWorth              int64  `json:"netWorth"`
	SavingsRateBPS        *int64 `json:"savingsRateBps"`
	DebtBurdenRateBPS     *int64 `json:"debtBurdenRateBps"`
	InterestLeakageBPS    *int64 `json:"interestLeakageBps"`
	BorrowedDependencyBPS *int64 `json:"borrowedDependencyBps"`
	WealthBuildRateBPS    *int64 `json:"wealthBuildRateBps"`
}

type annualOverallResponse struct {
	Year           int              `json:"year"`
	LatestDataYear int              `json:"latestDataYear"`
	AvailableYears []int            `json:"availableYears"`
	Rows           []string         `json:"rows"`
	Data           []monthlyInsight `json:"data"`
	YTD            monthlyInsight   `json:"ytd"`
}

type insightSummaryResponse struct {
	AsOfDate              string   `json:"asOfDate"`
	FreeCashFlow          int64    `json:"freeCashFlow"`
	NetWorth              int64    `json:"netWorth"`
	NetWorthChange        int64    `json:"netWorthChange"`
	WealthBuildRateBPS    *int64   `json:"wealthBuildRateBps"`
	SavingsRateBPS        *int64   `json:"savingsRateBps"`
	DebtBurdenRateBPS     *int64   `json:"debtBurdenRateBps"`
	InterestLeakageBPS    *int64   `json:"interestLeakageBps"`
	BorrowedDependencyBPS *int64   `json:"borrowedDependencyBps"`
	DebtRemaining         int64    `json:"debtRemaining"`
	InterestFeesPaid      int64    `json:"interestFeesPaid"`
	Alerts                []string `json:"alerts"`
}

type notificationItem struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Level     string `json:"level"`
	Href      string `json:"href"`
	CreatedAt string `json:"createdAt"`
}

type notificationsResponse struct {
	NotificationsEnabled bool               `json:"notificationsEnabled"`
	Items                []notificationItem `json:"items"`
}

func (s *Server) annualOverall(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	year := time.Now().Year()
	if raw := r.URL.Query().Get("year"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 2000 || parsed > 2100 {
			http.Error(w, "year is invalid", http.StatusBadRequest)
			return
		}
		year = parsed
	}
	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "ZMW"
	}

	data, ytd, err := s.monthlyInsights(r.Context(), claims.UserID, currency, year)
	if err != nil {
		http.Error(w, "failed to build annual overview", http.StatusInternalServerError)
		return
	}
	availableYears, err := s.availableInsightYears(r.Context(), claims.UserID, currency)
	if err != nil {
		http.Error(w, "failed to build annual overview", http.StatusInternalServerError)
		return
	}
	latestDataYear := year
	if len(availableYears) > 0 {
		latestDataYear = availableYears[0]
	}

	writeJSON(w, http.StatusOK, annualOverallResponse{
		Year:           year,
		LatestDataYear: latestDataYear,
		AvailableYears: availableYears,
		Rows: []string{
			"Earned Income",
			"Borrowed Income",
			"Total Inflow",
			"Living Expenses",
			"Debt Principal Paid",
			"Debt Interest/Fees",
			"Savings",
			"Investments",
			"Operating Balance",
			"Free Cash Flow",
			"Amount Brought Forward",
			"Ending Cash Balance",
			"Net Worth",
		},
		Data: data,
		YTD:  ytd,
	})
}

func (s *Server) availableInsightYears(ctx context.Context, userID, currency string) ([]int, error) {
	rows, err := s.db.Query(ctx, `
		select distinct extract(year from transaction_date)::int as year
		from transactions
		where user_id = $1
		  and currency = $2
		  and deleted_at is null
		order by year desc
	`, userID, currency)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	years := make([]int, 0)
	for rows.Next() {
		var year int
		if err := rows.Scan(&year); err != nil {
			return nil, err
		}
		years = append(years, year)
	}
	return years, rows.Err()
}

func (s *Server) insightSummary(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "ZMW"
	}
	asOf := time.Now()
	data, _, err := s.monthlyInsights(r.Context(), claims.UserID, currency, asOf.Year())
	if err != nil {
		http.Error(w, "failed to build insights", http.StatusInternalServerError)
		return
	}
	current := data[int(asOf.Month())-1]

	debtRemaining := int64(0)
	loans, err := s.loans.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to build debt insights", http.StatusInternalServerError)
		return
	}
	for _, loan := range loans {
		debtRemaining += loan.TotalRemainingBalance
	}

	previousNetWorth := int64(0)
	if asOf.Month() > time.January {
		previousNetWorth = data[int(asOf.Month())-2].NetWorth
	}

	alerts := buildInsightAlerts(current)

	writeJSON(w, http.StatusOK, insightSummaryResponse{
		AsOfDate:              asOf.Format("2006-01-02"),
		FreeCashFlow:          current.FreeCashFlow,
		NetWorth:              current.NetWorth,
		NetWorthChange:        current.NetWorth - previousNetWorth,
		WealthBuildRateBPS:    current.WealthBuildRateBPS,
		SavingsRateBPS:        current.SavingsRateBPS,
		DebtBurdenRateBPS:     current.DebtBurdenRateBPS,
		InterestLeakageBPS:    current.InterestLeakageBPS,
		BorrowedDependencyBPS: current.BorrowedDependencyBPS,
		DebtRemaining:         debtRemaining,
		InterestFeesPaid:      current.DebtInterestFees,
		Alerts:                alerts,
	})
}

func (s *Server) notifications(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	prefs, err := s.userPreferences.GetOrCreate(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to load notifications", http.StatusInternalServerError)
		return
	}

	response := notificationsResponse{
		NotificationsEnabled: prefs.NotificationsEnabled,
		Items:                []notificationItem{},
	}
	if !prefs.NotificationsEnabled {
		writeJSON(w, http.StatusOK, response)
		return
	}

	asOf := time.Now()
	data, _, err := s.monthlyInsights(r.Context(), claims.UserID, prefs.DefaultCurrency, asOf.Year())
	if err != nil {
		http.Error(w, "failed to build notifications", http.StatusInternalServerError)
		return
	}
	current := data[int(asOf.Month())-1]

	loans, err := s.loans.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to build notifications", http.StatusInternalServerError)
		return
	}

	items := make([]notificationItem, 0)
	for index, alert := range buildInsightAlerts(current) {
		items = append(items, notificationItem{
			ID:        "insight-" + strconv.Itoa(index+1),
			Title:     insightTitleForAlert(alert),
			Body:      alert,
			Level:     insightLevelForAlert(alert),
			Href:      notificationHrefForAlert(alert),
			CreatedAt: asOf.Format(time.RFC3339),
		})
	}

	activeLoanCount := 0
	totalDebtRemaining := int64(0)
	for _, loan := range loans {
		if loan.TotalRemainingBalance <= 0 {
			continue
		}
		activeLoanCount++
		totalDebtRemaining += loan.TotalRemainingBalance
	}
	if activeLoanCount > 0 {
		items = append(items, notificationItem{
			ID:        "loan-balance",
			Title:     "Outstanding loan balance",
			Body:      "You still have active loan balances to monitor in the Loans section. Total remaining debt is " + formatMinorAsMoney(totalDebtRemaining, prefs.DefaultCurrency) + ".",
			Level:     "info",
			Href:      "/loans",
			CreatedAt: asOf.Format(time.RFC3339),
		})
	}
	if activeLoanCount > 0 && current.FreeCashFlow < 0 {
		items = append(items, notificationItem{
			ID:        "loan-cashflow",
			Title:     "Debt and cash flow need attention",
			Body:      "Loan balances are still open while free cash flow is negative this month.",
			Level:     "warning",
			Href:      "/reports",
			CreatedAt: asOf.Format(time.RFC3339),
		})
	}

	response.Items = items
	writeJSON(w, http.StatusOK, response)
}

func buildInsightAlerts(current monthlyInsight) []string {
	alerts := make([]string, 0)
	if current.EarnedIncome > 0 {
		if current.LivingExpenses*10000/current.EarnedIncome > 7000 {
			alerts = append(alerts, "Living expenses exceeded 70% of earned income.")
		}
		if (current.DebtPrincipalPaid+current.DebtInterestFees)*10000/current.EarnedIncome > 3000 {
			alerts = append(alerts, "Debt payments exceeded 30% of earned income.")
		}
	}
	if current.BorrowedIncome > 0 {
		alerts = append(alerts, "Borrowed money was used this month.")
	}
	if current.FreeCashFlow < 0 {
		alerts = append(alerts, "Free cash flow is negative this month.")
	}
	return alerts
}

func insightTitleForAlert(alert string) string {
	switch {
	case alert == "Living expenses exceeded 70% of earned income.":
		return "Spending is running high"
	case alert == "Debt payments exceeded 30% of earned income.":
		return "Debt payments are heavy"
	case alert == "Borrowed money was used this month.":
		return "Borrowed money used this month"
	case alert == "Free cash flow is negative this month.":
		return "Free cash flow is negative"
	default:
		return "Financial alert"
	}
}

func insightLevelForAlert(alert string) string {
	switch {
	case alert == "Free cash flow is negative this month.", alert == "Debt payments exceeded 30% of earned income.":
		return "warning"
	default:
		return "info"
	}
}

func notificationHrefForAlert(alert string) string {
	switch {
	case alert == "Borrowed money was used this month.", alert == "Debt payments exceeded 30% of earned income.":
		return "/loans"
	case alert == "Living expenses exceeded 70% of earned income.", alert == "Free cash flow is negative this month.":
		return "/reports"
	default:
		return "/today"
	}
}

func formatMinorAsMoney(amount int64, currency string) string {
	sign := ""
	if amount < 0 {
		sign = "-"
		amount = -amount
	}
	return fmt.Sprintf("%s%s %d.%02d", sign, currency, amount/100, amount%100)
}

func (s *Server) monthlyInsights(ctx context.Context, userID, currency string, year int) ([]monthlyInsight, monthlyInsight, error) {
	rows, err := s.db.Query(ctx, `
		select
			extract(month from transaction_date)::int as month,
			coalesce(sum(case when entry_kind = 'income_earned' then amount else 0 end), 0)::bigint as earned_income,
			coalesce(sum(case when entry_kind = 'income_borrowed' and account_id not in (select liability_account_id from loans where user_id = $1) then amount else 0 end), 0)::bigint as borrowed_income,
			coalesce(sum(case when entry_kind = 'expense_living' then amount else 0 end), 0)::bigint as living_expenses,
			coalesce(sum(case when entry_kind = 'debt_principal_payment' then amount else 0 end), 0)::bigint as debt_principal,
			coalesce(sum(case when entry_kind in ('expense_interest', 'expense_fee') then amount else 0 end), 0)::bigint as debt_interest_fees,
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
			), 0)::bigint as savings,
			coalesce(sum(case when entry_kind = 'investment_buy' then amount else 0 end), 0)::bigint as investments
		from transactions
		left join accounts src on src.id = transactions.account_id and src.user_id = transactions.user_id
		left join accounts dest on dest.id = transactions.destination_account_id and dest.user_id = transactions.user_id
		where transactions.user_id = $1
		  and transactions.currency = $2
		  and transactions.deleted_at is null
		  and transactions.transaction_date >= $3
		  and transactions.transaction_date < $4
		group by month
	`, userID, currency, time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02"), time.Date(year+1, 1, 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02"))
	if err != nil {
		return nil, monthlyInsight{}, err
	}
	defer rows.Close()

	data := make([]monthlyInsight, 12)
	for i := range data {
		month := time.Month(i + 1)
		data[i] = monthlyInsight{
			Month:      i + 1,
			MonthLabel: month.String()[:3],
		}
	}

	for rows.Next() {
		var month int
		var insight monthlyInsight
		if err := rows.Scan(
			&month,
			&insight.EarnedIncome,
			&insight.BorrowedIncome,
			&insight.LivingExpenses,
			&insight.DebtPrincipalPaid,
			&insight.DebtInterestFees,
			&insight.Savings,
			&insight.Investments,
		); err != nil {
			return nil, monthlyInsight{}, err
		}
		if month < 1 || month > 12 {
			continue
		}
		data[month-1].EarnedIncome = insight.EarnedIncome
		data[month-1].BorrowedIncome = insight.BorrowedIncome
		data[month-1].LivingExpenses = insight.LivingExpenses
		data[month-1].DebtPrincipalPaid = insight.DebtPrincipalPaid
		data[month-1].DebtInterestFees = insight.DebtInterestFees
		data[month-1].Savings = insight.Savings
		data[month-1].Investments = insight.Investments
	}
	if err := rows.Err(); err != nil {
		return nil, monthlyInsight{}, err
	}

	ytd := monthlyInsight{MonthLabel: "YTD"}
	for i := range data {
		monthEnd := time.Date(year, time.Month(i+2), 0, 23, 59, 59, 0, time.UTC)
		if i == 0 {
			prior := time.Date(year, 1, 0, 23, 59, 59, 0, time.UTC)
			data[i].AmountBroughtForward, err = s.liquidCashBalanceAsOf(ctx, userID, currency, prior)
		} else {
			data[i].AmountBroughtForward = data[i-1].EndingCashBalance
		}
		if err != nil {
			return nil, monthlyInsight{}, err
		}
		data[i].EndingCashBalance, err = s.liquidCashBalanceAsOf(ctx, userID, currency, monthEnd)
		if err != nil {
			return nil, monthlyInsight{}, err
		}
		data[i].NetWorth, err = s.netWorthAsOf(ctx, userID, currency, monthEnd)
		if err != nil {
			return nil, monthlyInsight{}, err
		}

		data[i].TotalInflow = data[i].EarnedIncome + data[i].BorrowedIncome
		data[i].OperatingBalance = data[i].EarnedIncome - data[i].LivingExpenses
		data[i].FreeCashFlow = data[i].EarnedIncome - data[i].LivingExpenses - data[i].DebtPrincipalPaid - data[i].DebtInterestFees
		data[i].SavingsRateBPS = ratioBPS(data[i].Savings+data[i].Investments, data[i].EarnedIncome)
		data[i].DebtBurdenRateBPS = ratioBPS(data[i].DebtPrincipalPaid+data[i].DebtInterestFees, data[i].EarnedIncome)
		data[i].InterestLeakageBPS = ratioBPS(data[i].DebtInterestFees, data[i].EarnedIncome)
		data[i].BorrowedDependencyBPS = ratioBPS(data[i].BorrowedIncome, data[i].TotalInflow)
		data[i].WealthBuildRateBPS = ratioBPS(data[i].Savings+data[i].Investments+data[i].DebtPrincipalPaid, data[i].EarnedIncome)

		ytd.EarnedIncome += data[i].EarnedIncome
		ytd.BorrowedIncome += data[i].BorrowedIncome
		ytd.TotalInflow += data[i].TotalInflow
		ytd.LivingExpenses += data[i].LivingExpenses
		ytd.DebtPrincipalPaid += data[i].DebtPrincipalPaid
		ytd.DebtInterestFees += data[i].DebtInterestFees
		ytd.Savings += data[i].Savings
		ytd.Investments += data[i].Investments
		ytd.OperatingBalance += data[i].OperatingBalance
		ytd.FreeCashFlow += data[i].FreeCashFlow
		ytd.EndingCashBalance = data[i].EndingCashBalance
		ytd.NetWorth = data[i].NetWorth
	}
	ytd.SavingsRateBPS = ratioBPS(ytd.Savings+ytd.Investments, ytd.EarnedIncome)
	ytd.DebtBurdenRateBPS = ratioBPS(ytd.DebtPrincipalPaid+ytd.DebtInterestFees, ytd.EarnedIncome)
	ytd.InterestLeakageBPS = ratioBPS(ytd.DebtInterestFees, ytd.EarnedIncome)
	ytd.BorrowedDependencyBPS = ratioBPS(ytd.BorrowedIncome, ytd.TotalInflow)
	ytd.WealthBuildRateBPS = ratioBPS(ytd.Savings+ytd.Investments+ytd.DebtPrincipalPaid, ytd.EarnedIncome)

	return data, ytd, nil
}

func (s *Server) liquidCashBalanceAsOf(ctx context.Context, userID, currency string, asOf time.Time) (int64, error) {
	return s.accountBalanceAsOf(ctx, userID, currency, asOf, true)
}

func (s *Server) netWorthAsOf(ctx context.Context, userID, currency string, asOf time.Time) (int64, error) {
	accountBalance, err := s.accountBalanceAsOf(ctx, userID, currency, asOf, false)
	if err != nil {
		return 0, err
	}

	var investmentValue int64
	if err := s.db.QueryRow(ctx, `
		select coalesce(sum(coalesce(latest.current_value_minor, lots.total_cost_minor, 0)), 0)::bigint
		from assets a
		left join lateral (
			select coalesce(sum(round(total_cost::numeric * remaining_quantity / nullif(quantity, 0))), 0)::bigint as total_cost_minor
			from asset_lots
			where user_id = $1 and asset_id = a.id
		) lots on true
		left join lateral (
			select current_value_minor
			from asset_valuations
			where asset_id = a.id
			  and currency = $2
			  and valuation_date <= $3
			order by valuation_date desc, created_at desc
			limit 1
		) latest on true
		where a.user_id = $1 and a.currency = $2
	`, userID, currency, asOf.Format("2006-01-02")).Scan(&investmentValue); err != nil {
		return 0, err
	}

	return accountBalance + investmentValue, nil
}

func (s *Server) accountBalanceAsOf(ctx context.Context, userID, currency string, asOf time.Time, liquidOnly bool) (int64, error) {
	liquidClause := ""
	if liquidOnly {
		liquidClause = "and a.account_type in ('cash', 'mobile_money', 'bank') and a.account_class = 'asset'"
	}

	var balance int64
	err := s.db.QueryRow(ctx, `
		select coalesce(sum(
			case when a.account_class = 'liability' then -abs(balance_minor) else balance_minor end
		), 0)::bigint
		from (
			select
				a.account_class,
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
			  `+liquidClause+`
			group by a.id, a.account_class, a.opening_balance
		) balances
	`, userID, currency, asOf.Format("2006-01-02")).Scan(&balance)
	return balance, err
}

func ratioBPS(numerator, denominator int64) *int64 {
	if denominator <= 0 {
		return nil
	}
	value := numerator * 10000 / denominator
	return &value
}
