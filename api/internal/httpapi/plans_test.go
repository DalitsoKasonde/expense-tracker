package httpapi

import (
	"testing"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/plans"
)

func TestPlanResponseReportsWhatSomeoneIsEntitledToNowNotWhatIsStored(t *testing.T) {
	now := time.Date(2026, time.September, 12, 12, 0, 0, 0, time.UTC)
	lapsed := now.AddDate(0, 0, -1)

	got := buildPlanResponse(plans.Premium, &lapsed, plans.SourceSignup, now)

	if got.Plan != plans.Free {
		t.Fatalf("plan = %q, want %q for a lapsed trial", got.Plan, plans.Free)
	}
	// Advertising an expiry that has already passed invites a client to render
	// "premium until yesterday".
	if got.ExpiresAt != nil {
		t.Errorf("a lapsed plan still reported an expiry of %q", *got.ExpiresAt)
	}
	if got.Limits != plans.LimitsFor(plans.Free) {
		t.Error("a lapsed trial kept its premium limits")
	}
}

func TestPlanResponseCarriesTheExpiryWhileTheTrialStands(t *testing.T) {
	now := time.Date(2026, time.September, 12, 12, 0, 0, 0, time.UTC)
	expiry := now.AddDate(0, 1, 0)

	got := buildPlanResponse(plans.Premium, &expiry, plans.SourceSignup, now)

	if got.Plan != plans.Premium {
		t.Fatalf("plan = %q", got.Plan)
	}
	if got.ExpiresAt == nil || *got.ExpiresAt != expiry.Format(time.RFC3339) {
		t.Errorf("expiry = %v, want %s", got.ExpiresAt, expiry.Format(time.RFC3339))
	}
}

// The complimentary accounts must read as premium with no end date, for ever.
func TestComplimentaryAccountsNeverReportAnExpiry(t *testing.T) {
	got := buildPlanResponse(plans.Premium, nil, plans.SourceComp, time.Now().AddDate(50, 0, 0))

	if got.Plan != plans.Premium {
		t.Fatalf("plan = %q, want premium 50 years on", got.Plan)
	}
	if got.ExpiresAt != nil {
		t.Errorf("a never-expiring plan reported an expiry of %q", *got.ExpiresAt)
	}
}

func TestPlanResponseQuotesThePriceInMinorUnits(t *testing.T) {
	got := buildPlanResponse(plans.Free, nil, plans.SourceSignup, time.Now())

	if got.PriceMinor != 20_00 {
		t.Errorf("priceMinor = %d, want 2000 ngwee (K20.00)", got.PriceMinor)
	}
	if got.PriceCurren != "ZMW" {
		t.Errorf("currency = %q", got.PriceCurren)
	}
}

func TestDescribeMonthsReadsNaturallyInTheInvitationEmail(t *testing.T) {
	cases := map[int]string{0: "no free period", 1: "one month", 6: "6 months"}

	for months, want := range cases {
		if got := describeMonths(months); got != want {
			t.Errorf("describeMonths(%d) = %q, want %q", months, got, want)
		}
	}
}
