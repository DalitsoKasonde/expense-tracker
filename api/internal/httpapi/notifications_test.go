package httpapi

import (
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

func notificationTypes(items []notificationItem) []string {
	types := make([]string, 0, len(items))
	for _, item := range items {
		types = append(types, item.Type)
	}
	return types
}

func TestBuildNotificationsStaysSilentWhenTheMonthIsHealthy(t *testing.T) {
	items := buildNotifications(notificationInputs{
		Insight: monthlyInsight{
			EarnedIncome:   1_000_00,
			LivingExpenses: 300_00,
			FreeCashFlow:   400_00,
		},
		Currency: "ZMW",
		AsOf:     time.Now(),
	})

	if len(items) != 0 {
		t.Fatalf("a healthy month raised %v", notificationTypes(items))
	}
}

// A month with no earned income used to divide by zero conceptually — every
// ratio rule would read as "infinitely over budget" and fire at once.
func TestBuildNotificationsSkipsRatioRulesWhenNothingWasEarned(t *testing.T) {
	items := buildNotifications(notificationInputs{
		Insight: monthlyInsight{
			EarnedIncome:      0,
			LivingExpenses:    500_00,
			DebtPrincipalPaid: 200_00,
		},
		Currency: "ZMW",
		AsOf:     time.Now(),
	})

	for _, unwanted := range []string{notificationSpendingHigh, notificationDebtHeavy} {
		if slices.Contains(notificationTypes(items), unwanted) {
			t.Errorf("%s fired with no earned income to measure against", unwanted)
		}
	}
}

func TestBuildNotificationsRaisesEachRuleItsOwnType(t *testing.T) {
	items := buildNotifications(notificationInputs{
		Insight: monthlyInsight{
			EarnedIncome:      1_000_00,
			LivingExpenses:    800_00,
			DebtPrincipalPaid: 400_00,
			BorrowedIncome:    100_00,
			FreeCashFlow:      -50_00,
		},
		Loans:    []store.LoanSummary{{TotalRemainingBalance: 2_500_00}},
		Currency: "ZMW",
		AsOf:     time.Now(),
	})

	want := []string{
		notificationSpendingHigh,
		notificationDebtHeavy,
		notificationBorrowedMoney,
		notificationNegativeCashFlow,
		notificationLoanBalance,
		notificationLoanCashFlow,
	}
	if got := notificationTypes(items); !slices.Equal(got, want) {
		t.Fatalf("types = %v, want %v", got, want)
	}
}

// A settled loan is still listed, so counting rows rather than balances would
// nag someone about debt they have already cleared.
func TestBuildNotificationsIgnoresLoansThatAreAlreadyPaidOff(t *testing.T) {
	items := buildNotifications(notificationInputs{
		Insight:  monthlyInsight{EarnedIncome: 1_000_00, LivingExpenses: 100_00},
		Loans:    []store.LoanSummary{{TotalRemainingBalance: 0}},
		Currency: "ZMW",
		AsOf:     time.Now(),
	})

	if slices.Contains(notificationTypes(items), notificationLoanBalance) {
		t.Fatal("a fully repaid loan still raised an outstanding balance alert")
	}
}

func TestBuildNotificationsReportsTheLoanBalanceInTheUsersCurrency(t *testing.T) {
	items := buildNotifications(notificationInputs{
		Insight:  monthlyInsight{EarnedIncome: 1_000_00, LivingExpenses: 100_00},
		Loans:    []store.LoanSummary{{TotalRemainingBalance: 1_234_56}, {TotalRemainingBalance: 1_00}},
		Currency: "USD",
		AsOf:     time.Now(),
	})

	if len(items) != 1 {
		t.Fatalf("types = %v, want only the loan balance alert", notificationTypes(items))
	}
	if want := "USD 1235.56"; !strings.Contains(items[0].Body, want) {
		t.Fatalf("body = %q, want it to quote %q", items[0].Body, want)
	}
}

func TestFilterNotificationsDropsOnlyTheMutedTypes(t *testing.T) {
	items := []notificationItem{
		{Type: notificationSpendingHigh},
		{Type: notificationLoanBalance},
		{Type: notificationNegativeCashFlow},
	}

	kept := filterNotifications(items, []string{notificationLoanBalance})

	if got := notificationTypes(kept); !slices.Equal(got, []string{notificationSpendingHigh, notificationNegativeCashFlow}) {
		t.Fatalf("kept = %v", got)
	}
}

func TestValidNotificationTypesRejectsUnknownAndDuplicateTypes(t *testing.T) {
	got := validNotificationTypes([]string{notificationLoanBalance, "made-up", notificationLoanBalance})

	if !slices.Equal(got, []string{notificationLoanBalance}) {
		t.Fatalf("got %v, want only the known type once", got)
	}
}

// Every alert the rules can raise must be listed in the catalogue, or it shows
// up in someone's inbox with no way to turn it off.
func TestEveryNotificationTypeIsInTheCatalogue(t *testing.T) {
	items := buildNotifications(notificationInputs{
		Insight: monthlyInsight{
			EarnedIncome:      1_000_00,
			LivingExpenses:    800_00,
			DebtPrincipalPaid: 400_00,
			BorrowedIncome:    100_00,
			FreeCashFlow:      -50_00,
		},
		Loans:    []store.LoanSummary{{TotalRemainingBalance: 100_00}},
		Currency: "ZMW",
		AsOf:     time.Now(),
	})

	for _, item := range items {
		if len(validNotificationTypes([]string{item.Type})) != 1 {
			t.Errorf("alert type %q is raised but missing from notificationCatalogue", item.Type)
		}
	}
}
