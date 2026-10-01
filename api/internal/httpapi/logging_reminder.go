package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/mail"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

// reminderSendHour is evening in Lusaka, when the day's spending is done and
// still remembered. It is read in lusakaLocation rather than server time: the
// API container runs on UTC, where 19:00 would land at 21:00.
const reminderSendHour = 19

const reminderDateLayout = "2006-01-02"

// reminderMinimumGap matches the Today banner: one day behind is usually just
// today not being entered yet.
const reminderMinimumGap = 2

// reminderDaysBehind is how many whole days lie between the newest entry and
// today in Lusaka, or -1 when there is nothing to measure from.
func reminderDaysBehind(lastEntryDate *string, now time.Time) int {
	if lastEntryDate == nil {
		return -1
	}
	last, err := time.ParseInLocation(reminderDateLayout, *lastEntryDate, lusakaLocation)
	if err != nil {
		return -1
	}
	local := now.In(lusakaLocation)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, lusakaLocation)
	days := int(today.Sub(last).Hours() / 24)
	if days < 0 {
		return 0
	}
	return days
}

// reminderIsDue decides whether tonight is a reminder night.
//
// It backs off on purpose. An email every evening for a record three weeks
// behind teaches someone to ignore it, which would also bury the next one that
// matters. So: the second and fourth day, then once a week.
func reminderIsDue(lastEntryDate *string, now time.Time) (int, bool) {
	if now.In(lusakaLocation).Hour() < reminderSendHour {
		return 0, false
	}
	days := reminderDaysBehind(lastEntryDate, now)
	if days < reminderMinimumGap {
		return days, false
	}
	return days, days == 2 || days == 4 || days%7 == 0
}

func reminderSubject(days int) string {
	return fmt.Sprintf("Nothing recorded for %d days", days)
}

// buildReminderDocument is the email itself. Plain data in, so the wording can
// be tested without a database or a mail server.
func buildReminderDocument(recipient store.ReminderRecipient, days int, publicURL string) mail.Document {
	last := *recipient.LastEntryDate
	if parsed, err := time.Parse(reminderDateLayout, last); err == nil {
		last = parsed.Format("Monday 2 January")
	}

	blocks := []mail.Block{
		mail.Paragraph(greeting(recipient.DisplayName)),
		mail.Paragraph(fmt.Sprintf("Your entries stop at %s, %d days ago.", last, days)),
	}
	if days <= 4 {
		blocks = append(blocks, mail.Paragraph("A few minutes now is easier than a long evening later: your mobile money messages and banking app still have every payment."))
	} else {
		blocks = append(blocks, mail.Paragraph("Paste your mobile money SMS into the catch-up sheet, add anything from your banking app, and record whatever is left as one line when you match the balance. Nothing has to be remembered exactly."))
	}
	blocks = append(blocks, mail.Button{Label: "Catch up now", URL: publicURL + "/add/catch-up"})

	return mail.Document{
		Preheader:  fmt.Sprintf("Your entries stop at %s.", last),
		Heading:    reminderSubject(days),
		Style:      mail.Letter,
		Blocks:     blocks,
		FooterNote: "You receive this because logging reminders are on. Turn them off in Settings › Preferences.",
	}
}

// runReminderPass sends tonight's reminders. Every tick after the send hour
// repeats it; the dedupe key, one per person per Lusaka day, is what keeps that
// to a single email.
func (s *Server) runReminderPass(ctx context.Context, now time.Time) {
	today := now.In(lusakaLocation).Format(reminderDateLayout)
	if now.In(lusakaLocation).Hour() < reminderSendHour {
		return
	}

	recipients, err := s.userPreferences.ListReminderRecipients(ctx, today)
	if err != nil {
		log.Printf("reminder: could not list recipients: %v", err)
		return
	}

	for _, recipient := range recipients {
		days, due := reminderIsDue(recipient.LastEntryDate, now)
		if !due {
			continue
		}
		err := s.mailer.send(ctx, outgoing{
			UserID:          &recipient.UserID,
			Recipient:       recipient.Email,
			Kind:            store.EmailKindReminder,
			Subject:         reminderSubject(days),
			DedupeKey:       fmt.Sprintf("reminder:%s:%s", recipient.UserID, today),
			Document:        buildReminderDocument(recipient, days, s.config.AppPublicURL),
			ListUnsubscribe: s.mailer.link("/settings/preferences"),
		})
		if err != nil && !errors.Is(err, store.ErrEmailAlreadySent) {
			// One person's failure must not stop everybody else's mail.
			log.Printf("reminder: could not send to user %s: %v", recipient.UserID, err)
		}
	}
}
