package plans

import (
	"testing"
	"time"
)

func TestALapsedTrialFallsBackToFreeRatherThanFailing(t *testing.T) {
	now := time.Date(2026, time.September, 12, 12, 0, 0, 0, time.UTC)
	yesterday := now.AddDate(0, 0, -1)

	if got := Effective(Premium, &yesterday, now); got != Free {
		t.Fatalf("a lapsed premium plan resolved to %q, want %q", got, Free)
	}
}

func TestAnUnexpiredTrialIsStillPremium(t *testing.T) {
	now := time.Date(2026, time.September, 12, 12, 0, 0, 0, time.UTC)
	nextMonth := now.AddDate(0, 1, 0)

	if got := Effective(Premium, &nextMonth, now); got != Premium {
		t.Fatalf("an unexpired trial resolved to %q, want %q", got, Premium)
	}
}

// The complimentary accounts must never lapse, and a nil expiry is the only
// thing standing between them and being downgraded by the clock.
func TestAPlanWithNoExpiryNeverLapses(t *testing.T) {
	far := time.Date(2099, time.January, 1, 0, 0, 0, 0, time.UTC)

	if got := Effective(Premium, nil, far); got != Premium {
		t.Fatalf("a never-expiring plan resolved to %q at %s", got, far)
	}
}

// An expiry on a free plan is meaningless and must not promote anyone.
func TestAFreePlanIsNeverPromotedByAnExpiryDate(t *testing.T) {
	now := time.Now()
	future := now.AddDate(1, 0, 0)

	if got := Effective(Free, &future, now); got != Free {
		t.Fatalf("a free plan with a future expiry resolved to %q", got)
	}
	if got := Effective("nonsense", nil, now); got != Free {
		t.Fatalf("an unknown plan resolved to %q, want %q", got, Free)
	}
}

func TestFreeCanStillReachEveryPartOfTheApp(t *testing.T) {
	free := LimitsFor(Free)

	// The point of capacity limits over feature switches: a beginner must be
	// able to record a first share and a first bond without paying.
	if free.Investments < 2 {
		t.Errorf("free allows %d holdings, too few to record a first share and a first bond", free.Investments)
	}
	if free.Accounts < 4 {
		t.Errorf("free allows %d accounts, fewer than bank + Airtel + MTN + cash", free.Accounts)
	}
	for name, limit := range map[string]int{
		"savings goals":  free.SavingsGoals,
		"loans":          free.Loans,
		"savings groups": free.SavingsGroups,
	} {
		if limit == 0 {
			t.Errorf("free allows no %s at all, which blocks the feature rather than capping it", name)
		}
	}
}

func TestPremiumLiftsEveryLimit(t *testing.T) {
	premium := LimitsFor(Premium)

	for name, limit := range map[string]int{
		"accounts":       premium.Accounts,
		"savings goals":  premium.SavingsGoals,
		"investments":    premium.Investments,
		"loans":          premium.Loans,
		"savings groups": premium.SavingsGroups,
	} {
		if limit != Unlimited {
			t.Errorf("premium caps %s at %d", name, limit)
		}
	}
	if !premium.ExcelImport || !premium.EmailSummaries || !premium.MultiCurrency || !premium.Businesses {
		t.Error("premium is missing one of the paid capabilities")
	}
}

func TestUnknownPlansGetFreeLimitsRatherThanUnlimited(t *testing.T) {
	if LimitsFor("nonsense") != LimitsFor(Free) {
		t.Fatal("an unrecognised plan did not fall back to the free limits")
	}
}

func TestAllowsTreatsUnlimitedAsNoCeiling(t *testing.T) {
	limits := LimitsFor(Free)

	if !limits.Allows(limits.Investments, 2) {
		t.Error("a third holding was refused on the free plan")
	}
	if limits.Allows(limits.Investments, 3) {
		t.Error("a fourth holding was allowed on the free plan")
	}
	if !limits.Allows(Unlimited, 10_000) {
		t.Error("an unlimited allowance refused a large count")
	}
}

func TestTrialExpiryLandsOnACalendarDateAPersonRecognises(t *testing.T) {
	start := time.Date(2026, time.September, 12, 9, 30, 0, 0, time.UTC)

	if got := TrialExpiry(SignupTrialMonths, start); !got.Equal(time.Date(2026, time.October, 12, 9, 30, 0, 0, time.UTC)) {
		t.Errorf("one-month trial ends %s", got)
	}
	if got := TrialExpiry(InviteTrialMonths, start); !got.Equal(time.Date(2027, time.March, 12, 9, 30, 0, 0, time.UTC)) {
		t.Errorf("six-month trial ends %s", got)
	}
}
