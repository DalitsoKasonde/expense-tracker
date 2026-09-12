package httpapi

import (
	"strings"
	"testing"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

func at(year int, month time.Month, day, hour int) time.Time {
	return time.Date(year, month, day, hour, 0, 0, 0, time.Local)
}

func TestDigestIsNotDueBeforeTheSendHourSoNobodyIsMailedAtNight(t *testing.T) {
	if digestIsDue("daily", nil, at(2026, time.September, 12, 3)) {
		t.Fatal("a digest was due at 03:00")
	}
	if !digestIsDue("daily", nil, at(2026, time.September, 12, digestSendHour)) {
		t.Fatal("a digest was not due once the send hour arrived")
	}
}

func TestDigestIsDueOncePerPeriodNotOncePerTick(t *testing.T) {
	morning := at(2026, time.September, 12, 8)
	justSent := morning.Add(-30 * time.Minute)

	if digestIsDue("daily", &justSent, morning) {
		t.Fatal("a second daily digest was due in the same day")
	}

	yesterday := at(2026, time.September, 11, 8)
	if !digestIsDue("daily", &yesterday, morning) {
		t.Fatal("a daily digest was not due the next day")
	}
}

func TestWeeklyAndMonthlyDigestsLandOnAPredictableDay(t *testing.T) {
	monday := at(2026, time.September, 14, 8)
	if monday.Weekday() != time.Monday {
		t.Fatalf("test fixture is a %s, not a Monday", monday.Weekday())
	}

	if digestIsDue("weekly", nil, monday.AddDate(0, 0, 1)) {
		t.Error("a weekly digest was due on a Tuesday")
	}
	if !digestIsDue("weekly", nil, monday) {
		t.Error("a weekly digest was not due on Monday")
	}

	if digestIsDue("monthly", nil, at(2026, time.September, 2, 8)) {
		t.Error("a monthly digest was due on the 2nd")
	}
	if !digestIsDue("monthly", nil, at(2026, time.September, 1, 8)) {
		t.Error("a monthly digest was not due on the 1st")
	}
}

func TestDigestIsNeverDueWhenTurnedOff(t *testing.T) {
	if digestIsDue("off", nil, at(2026, time.September, 12, 9)) {
		t.Fatal("a digest was due for someone who turned them off")
	}
}

// The period key is the duplicate guard the delivery log enforces, so two
// moments in the same window must produce the same key and two in different
// windows must not.
func TestDigestPeriodKeyIdentifiesTheWindow(t *testing.T) {
	mondayMorning := at(2026, time.September, 14, 8)
	mondayEvening := at(2026, time.September, 14, 20)
	nextMonday := at(2026, time.September, 21, 8)

	if digestPeriodKey("weekly", mondayMorning) != digestPeriodKey("weekly", mondayEvening) {
		t.Error("two times in the same week produced different keys")
	}
	if digestPeriodKey("weekly", mondayMorning) == digestPeriodKey("weekly", nextMonday) {
		t.Error("two different weeks produced the same key")
	}
	if digestPeriodKey("monthly", at(2026, time.September, 1, 8)) == digestPeriodKey("monthly", at(2026, time.October, 1, 8)) {
		t.Error("two different months produced the same key")
	}
}

func TestDailyDigestIsSkippedWhenThereIsNothingToSay(t *testing.T) {
	recipient := store.DigestRecipient{Frequency: "daily", DefaultCurrency: "ZMW", DisplayName: "Dalitso Kasonde"}

	_, worthSending := buildDigestDocument(recipient, monthlyInsight{EarnedIncome: 100_00}, nil, "https://chuma.app", time.Now())

	if worthSending {
		t.Fatal("an empty daily digest would have been sent")
	}
}

// A weekly or monthly summary is worth sending on its figures alone, which is
// what makes it a summary rather than an alert.
func TestWeeklyDigestIsSentEvenWithNoAlerts(t *testing.T) {
	recipient := store.DigestRecipient{Frequency: "weekly", DefaultCurrency: "ZMW"}

	document, worthSending := buildDigestDocument(recipient, monthlyInsight{EarnedIncome: 100_00}, nil, "https://chuma.app", time.Now())

	if !worthSending {
		t.Fatal("a weekly summary with no alerts was skipped")
	}
	_, textBody := document.Render()
	if !strings.Contains(textBody, "ZMW 100.00") {
		t.Errorf("the summary did not carry the month's figures:\n%s", textBody)
	}
}

func TestDigestLeavesOutTheAlertsAPersonMuted(t *testing.T) {
	recipient := store.DigestRecipient{
		Frequency:       "weekly",
		DefaultCurrency: "ZMW",
		MutedTypes:      []string{notificationLoanBalance},
	}
	items := []notificationItem{
		{Type: notificationLoanBalance, Title: "Outstanding loan balance", Body: "You owe money.", Level: "info", Href: "/loans"},
		{Type: notificationNegativeCashFlow, Title: "Free cash flow is negative", Body: "Watch out.", Level: "warning", Href: "/reports"},
	}

	document, worthSending := buildDigestDocument(recipient, monthlyInsight{}, items, "https://chuma.app", time.Now())
	if !worthSending {
		t.Fatal("the digest was skipped entirely")
	}

	_, textBody := document.Render()
	if strings.Contains(textBody, "Outstanding loan balance") {
		t.Error("a muted alert was emailed anyway")
	}
	if !strings.Contains(textBody, "Free cash flow is negative") {
		t.Error("muting one alert silenced another")
	}
}

// Alert links are read outside the app, where a path on its own goes nowhere.
func TestDigestLinksAreAbsolute(t *testing.T) {
	recipient := store.DigestRecipient{Frequency: "weekly", DefaultCurrency: "ZMW"}
	items := []notificationItem{{Type: notificationNegativeCashFlow, Title: "Negative", Body: "Watch out.", Level: "warning", Href: "/reports"}}

	document, _ := buildDigestDocument(recipient, monthlyInsight{}, items, "https://chuma.app", time.Now())

	_, textBody := document.Render()
	if !strings.Contains(textBody, "https://chuma.app/reports") {
		t.Errorf("alert link was not absolute:\n%s", textBody)
	}
}

func TestDigestSubjectNamesThePeriodSoInboxesStayScannable(t *testing.T) {
	now := at(2026, time.September, 14, 8)

	if got := digestSubject("weekly", now); !strings.Contains(got, "14 September 2026") {
		t.Errorf("weekly subject = %q", got)
	}
	// A monthly digest goes out on the 1st and describes the month that just
	// ended, so naming the current month would be off by one.
	if got := digestSubject("monthly", at(2026, time.October, 1, 8)); !strings.Contains(got, "September 2026") {
		t.Errorf("monthly subject = %q, want it to name the month that just ended", got)
	}
}
