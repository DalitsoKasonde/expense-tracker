// Package plans holds what a subscription entitles someone to.
//
// The limits are deliberately capacity limits rather than feature switches: a
// person on the free plan can reach every part of the app, including
// investments, and only meets a limit once they have outgrown what one
// person's ordinary finances need. Being told "you cannot try this" turns away
// exactly the people worth keeping; being told "you have outgrown three
// holdings" arrives at a moment when paying makes obvious sense.
package plans

import "time"

const (
	Free    = "free"
	Premium = "premium"
)

// How a plan was arrived at, for the admin console and for knowing which
// accounts must never be billed.
const (
	SourceSignup = "signup"
	SourceInvite = "invite"
	SourceComp   = "comp"
	SourcePaid   = "paid"
)

// Trial lengths. An invited beta tester gets longer because they are being
// asked to put real financial records into unfinished software.
const (
	SignupTrialMonths = 1
	InviteTrialMonths = 6
)

// Unlimited marks a limit that does not apply. It is -1 rather than 0 so that
// a zero value never reads as "unlimited" by accident.
const Unlimited = -1

// Limits is what a plan allows. Nothing enforces these yet; they are defined
// here first so the rules live in one place and enforcement becomes a call
// rather than a scattering of magic numbers.
type Limits struct {
	Accounts       int
	SavingsGoals   int
	Investments    int
	Loans          int
	SavingsGroups  int
	MultiCurrency  bool
	ExcelImport    bool
	EmailSummaries bool
	Businesses     bool
}

// Allows reports whether a count is still within a limit.
func (l Limits) Allows(limit, current int) bool {
	return limit == Unlimited || current < limit
}

var limitsByPlan = map[string]Limits{
	Free: {
		// Bank, Airtel, MTN and cash is the realistic Zambian set; five leaves
		// room for one more before anyone feels squeezed.
		Accounts:     5,
		SavingsGoals: 2,
		// Enough for a first share, a first bond, and one more. A beginner
		// never reaches it; someone running a portfolio reaches it quickly.
		Investments:    3,
		Loans:          2,
		SavingsGroups:  1,
		MultiCurrency:  false,
		ExcelImport:    false,
		EmailSummaries: false,
		Businesses:     false,
	},
	Premium: {
		Accounts:       Unlimited,
		SavingsGoals:   Unlimited,
		Investments:    Unlimited,
		Loans:          Unlimited,
		SavingsGroups:  Unlimited,
		MultiCurrency:  true,
		ExcelImport:    true,
		EmailSummaries: true,
		Businesses:     true,
	},
}

// Effective resolves what someone is actually entitled to right now. A lapsed
// premium plan reads as free rather than as an error: the account keeps
// working and its history stays readable, only the limits come back. Locking
// someone out of their own financial records over a missed K20 is how a
// finance app loses the trust it runs on.
func Effective(plan string, expiresAt *time.Time, now time.Time) string {
	if plan != Premium {
		return Free
	}
	// A nil expiry never lapses, which is how complimentary accounts work.
	if expiresAt == nil {
		return Premium
	}
	if now.Before(*expiresAt) {
		return Premium
	}
	return Free
}

// LimitsFor returns the limits of an already-resolved plan. Callers pass the
// result of Effective, never the stored column, or a lapsed trial would keep
// its entitlements.
func LimitsFor(plan string) Limits {
	if limits, ok := limitsByPlan[plan]; ok {
		return limits
	}
	return limitsByPlan[Free]
}

// TrialExpiry is when a trial of the given length ends. Months are added on
// the calendar rather than as fixed days, so a month-long trial started on the
// 31st ends on a date a person would recognise.
func TrialExpiry(months int, from time.Time) *time.Time {
	if months <= 0 {
		return &from
	}
	expiry := from.AddDate(0, months, 0)
	return &expiry
}
