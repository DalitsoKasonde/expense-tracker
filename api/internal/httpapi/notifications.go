package httpapi

import (
	"slices"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

// Notification types. These strings are stored in a person's muted list and
// sent to the browser, so they are part of the contract: rename one and
// everybody who muted it silently starts receiving it again.
const (
	notificationSpendingHigh     = "spending-high"
	notificationDebtHeavy        = "debt-heavy"
	notificationBorrowedMoney    = "borrowed-money"
	notificationNegativeCashFlow = "negative-cash-flow"
	notificationLoanBalance      = "loan-balance"
	notificationLoanCashFlow     = "loan-cash-flow"
)

// notificationDefinition describes one alert for the settings screen, where a
// person picks which of these reach their inbox.
type notificationDefinition struct {
	Type        string `json:"type"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

// notificationCatalogue is the full set of alerts the app can raise. The
// settings screen renders from this, so a new alert type appears there without
// a frontend change.
var notificationCatalogue = []notificationDefinition{
	{
		Type:        notificationSpendingHigh,
		Label:       "Spending is running high",
		Description: "Living expenses passed 70% of what you earned this month.",
	},
	{
		Type:        notificationDebtHeavy,
		Label:       "Debt payments are heavy",
		Description: "Loan repayments, interest and fees passed 30% of what you earned.",
	},
	{
		Type:        notificationBorrowedMoney,
		Label:       "Borrowed money used",
		Description: "You took on new borrowing this month.",
	},
	{
		Type:        notificationNegativeCashFlow,
		Label:       "Free cash flow is negative",
		Description: "More money left than came in this month.",
	},
	{
		Type:        notificationLoanBalance,
		Label:       "Outstanding loan balance",
		Description: "A reminder of what you still owe across open loans.",
	},
	{
		Type:        notificationLoanCashFlow,
		Label:       "Debt and cash flow together",
		Description: "Loans are still open while this month's cash flow is negative.",
	},
}

// notificationInputs is everything the alert rules read. Taking it as data
// rather than reaching into the database is what lets the rules be tested
// without one.
type notificationInputs struct {
	Insight  monthlyInsight
	Loans    []store.LoanSummary
	Currency string
	AsOf     time.Time
}

// buildNotifications applies every alert rule and returns what fired, newest
// concern first. Both the in-app bell and the email digest call this, so the
// two can never disagree about what is worth telling someone.
func buildNotifications(in notificationInputs) []notificationItem {
	current := in.Insight
	createdAt := in.AsOf.Format(time.RFC3339)
	items := make([]notificationItem, 0)

	add := func(notificationType, title, body, level, href string) {
		items = append(items, notificationItem{
			ID:        notificationType,
			Type:      notificationType,
			Title:     title,
			Body:      body,
			Level:     level,
			Href:      href,
			CreatedAt: createdAt,
		})
	}

	// Ratios are only meaningful against earned income; with none recorded a
	// month looks like 100% of nothing and would fire every alert at once.
	if current.EarnedIncome > 0 {
		if current.LivingExpenses*10000/current.EarnedIncome > 7000 {
			add(notificationSpendingHigh, "Spending is running high",
				"Living expenses exceeded 70% of earned income.", "info", "/reports")
		}
		if (current.DebtPrincipalPaid+current.DebtInterestFees)*10000/current.EarnedIncome > 3000 {
			add(notificationDebtHeavy, "Debt payments are heavy",
				"Debt payments exceeded 30% of earned income.", "warning", "/loans")
		}
	}
	if current.BorrowedIncome > 0 {
		add(notificationBorrowedMoney, "Borrowed money used this month",
			"Borrowed money was used this month.", "info", "/loans")
	}
	if current.FreeCashFlow < 0 {
		add(notificationNegativeCashFlow, "Free cash flow is negative",
			"Free cash flow is negative this month.", "warning", "/reports")
	}

	activeLoanCount := 0
	totalDebtRemaining := int64(0)
	for _, loan := range in.Loans {
		if loan.TotalRemainingBalance <= 0 {
			continue
		}
		activeLoanCount++
		totalDebtRemaining += loan.TotalRemainingBalance
	}
	if activeLoanCount > 0 {
		add(notificationLoanBalance, "Outstanding loan balance",
			"You still have active loan balances to monitor in the Loans section. Total remaining debt is "+
				formatMinorAsMoney(totalDebtRemaining, in.Currency)+".", "info", "/loans")
	}
	if activeLoanCount > 0 && current.FreeCashFlow < 0 {
		add(notificationLoanCashFlow, "Debt and cash flow need attention",
			"Loan balances are still open while free cash flow is negative this month.", "warning", "/reports")
	}

	return items
}

// filterNotifications drops the types a person muted. Muting is an email-only
// setting: the in-app bell keeps showing everything, because a list you chose
// to open is not an interruption the way an email is.
func filterNotifications(items []notificationItem, muted []string) []notificationItem {
	if len(muted) == 0 {
		return items
	}

	kept := make([]notificationItem, 0, len(items))
	for _, item := range items {
		if slices.Contains(muted, item.Type) {
			continue
		}
		kept = append(kept, item)
	}
	return kept
}

// validNotificationTypes drops anything not in the catalogue before it reaches
// the database, so a stale client cannot persist a mute for an alert that no
// longer exists.
func validNotificationTypes(requested []string) []string {
	valid := make([]string, 0, len(requested))
	for _, candidate := range requested {
		for _, definition := range notificationCatalogue {
			if definition.Type == candidate && !slices.Contains(valid, candidate) {
				valid = append(valid, candidate)
				break
			}
		}
	}
	return valid
}
