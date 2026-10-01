package httpapi

import (
	"strings"
	"testing"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

// lusakaAt is a wall-clock time in Lusaka, whatever zone the test machine is in.
func lusakaAt(year int, month time.Month, day, hour int) time.Time {
	return time.Date(year, month, day, hour, 0, 0, 0, lusakaLocation)
}

func dateString(value string) *string { return &value }

func TestReminderWaitsForTheEveningInLusakaNotOnTheServerClock(t *testing.T) {
	last := dateString("2026-09-28")

	if _, due := reminderIsDue(last, lusakaAt(2026, time.September, 30, 18)); due {
		t.Fatal("a reminder was due at 18:00 Lusaka")
	}
	// 17:00 UTC is 19:00 in Lusaka: the container's clock must not delay it.
	utcEvening := time.Date(2026, time.September, 30, 17, 0, 0, 0, time.UTC)
	if _, due := reminderIsDue(last, utcEvening); !due {
		t.Fatal("a reminder was not due at 19:00 Lusaka (17:00 UTC)")
	}
}

func TestReminderStaysQuietWhileTheRecordIsCurrent(t *testing.T) {
	evening := lusakaAt(2026, time.September, 30, 20)
	for _, last := range []string{"2026-09-30", "2026-09-29"} {
		if _, due := reminderIsDue(dateString(last), evening); due {
			t.Fatalf("a reminder was due with the last entry on %s", last)
		}
	}
	if _, due := reminderIsDue(nil, evening); due {
		t.Fatal("a reminder was due before the first entry was ever recorded")
	}
}

func TestReminderBacksOffSoALongGapIsNotAnEmailEveryNight(t *testing.T) {
	evening := lusakaAt(2026, time.October, 31, 20)
	var nights []int
	for days := 0; days <= 21; days++ {
		last := evening.AddDate(0, 0, -days).Format(reminderDateLayout)
		if _, due := reminderIsDue(&last, evening); due {
			nights = append(nights, days)
		}
	}

	want := []int{2, 4, 7, 14, 21}
	if len(nights) != len(want) {
		t.Fatalf("reminder nights = %v, want %v", nights, want)
	}
	for index := range want {
		if nights[index] != want[index] {
			t.Fatalf("reminder nights = %v, want %v", nights, want)
		}
	}
}

func TestReminderCountsDaysOnTheLusakaCalendar(t *testing.T) {
	// 23:30 UTC on the 30th is already the 1st in Lusaka.
	lateUTC := time.Date(2026, time.September, 30, 23, 30, 0, 0, time.UTC)
	if days := reminderDaysBehind(dateString("2026-09-29"), lateUTC); days != 2 {
		t.Fatalf("days behind = %d, want 2", days)
	}
}

func TestReminderEmailNamesTheDayAndLinksToTheCatchUpSheet(t *testing.T) {
	recipient := store.ReminderRecipient{UserID: "u1", Email: "a@example.com", DisplayName: "Dalitso Kasonde", LastEntryDate: dateString("2026-09-10")}
	document := buildReminderDocument(recipient, 20, "https://app.example")
	_, text := document.Render()

	for _, want := range []string{"Hello Dalitso,", "Thursday 10 September, 20 days ago", "https://app.example/add/catch-up", "Settings › Preferences"} {
		if !strings.Contains(text, want) {
			t.Fatalf("reminder text does not contain %q:\n%s", want, text)
		}
	}
	// A long gap gets the way through it, not just a nudge.
	if !strings.Contains(text, "mobile money SMS") {
		t.Fatalf("a 20-day reminder did not explain how to catch up:\n%s", text)
	}
}

func TestReminderSubjectSaysHowLong(t *testing.T) {
	if got := reminderSubject(4); got != "Nothing recorded for 4 days" {
		t.Fatalf("subject = %q", got)
	}
}
