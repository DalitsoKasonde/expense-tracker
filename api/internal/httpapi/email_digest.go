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

const (
	// digestSendHour keeps scheduled mail out of the middle of the night. The
	// server's local time is what counts; there is no per-user timezone yet.
	digestSendHour = 7
	// digestTick is how often the scheduler looks for due mail. It is well
	// under an hour so a send window is never missed, and the period dedupe key
	// makes the extra passes harmless.
	digestTick = 15 * time.Minute
)

// digestPeriodKey names the window a digest belongs to. It is the second half
// of the duplicate guard: even if the due check fires twice, both attempts
// claim the same key and only the first one sends.
func digestPeriodKey(frequency string, now time.Time) string {
	switch frequency {
	case "weekly":
		year, week := now.ISOWeek()
		return fmt.Sprintf("%d-W%02d", year, week)
	case "monthly":
		return now.Format("2006-01")
	default:
		return now.Format("2006-01-02")
	}
}

// digestIsDue reports whether a subscriber's next digest window has opened.
// Weekly digests land on Monday and monthly ones on the first of the month, so
// the mail arrives on a predictable day rather than drifting with whenever the
// setting happened to be switched on.
func digestIsDue(frequency string, lastSentAt *time.Time, now time.Time) bool {
	if frequency == "off" || now.Hour() < digestSendHour {
		return false
	}

	switch frequency {
	case "daily":
		// nothing further to check; one per calendar day
	case "weekly":
		if now.Weekday() != time.Monday {
			return false
		}
	case "monthly":
		if now.Day() != 1 {
			return false
		}
	default:
		return false
	}

	// A first-time subscriber gets their first digest in the next window
	// rather than waiting a whole period for one.
	if lastSentAt == nil {
		return true
	}
	return digestPeriodKey(frequency, *lastSentAt) != digestPeriodKey(frequency, now)
}

// digestSubject names the period so a run of these emails is scannable in an
// inbox rather than six identical lines.
func digestSubject(frequency string, now time.Time) string {
	switch frequency {
	case "weekly":
		return "Your week in Inscribed Expenses — " + now.Format("2 January 2006")
	case "monthly":
		return "Your " + now.AddDate(0, 0, -1).Format("January 2006") + " summary"
	default:
		return "Inscribed Expenses today — " + now.Format("2 January 2006")
	}
}

// buildDigestDocument turns a month's figures and alerts into an email. It
// takes plain data so the wording and the "is this worth sending" rule can be
// tested without a database or a mail server.
func buildDigestDocument(recipient store.DigestRecipient, insight monthlyInsight, items []notificationItem, publicURL string, now time.Time) (mail.Document, bool) {
	items = filterNotifications(items, recipient.MutedTypes)

	// A daily email that says nothing happened is the fastest way to teach
	// someone to ignore these. Weekly and monthly go out regardless, because
	// there the figures themselves are the point.
	if len(items) == 0 && recipient.Frequency == "daily" {
		return mail.Document{}, false
	}

	currency := recipient.DefaultCurrency
	blocks := []mail.Block{
		mail.Paragraph(greeting(recipient.DisplayName)),
	}

	if len(items) > 0 {
		blocks = append(blocks, mail.Paragraph("Here is what stood out in "+now.Month().String()+":"))
		for _, item := range items {
			blocks = append(blocks, mail.Alert{
				Title: item.Title,
				Body:  item.Body,
				Level: item.Level,
				URL:   publicURL + item.Href,
			})
		}
	} else {
		blocks = append(blocks, mail.Paragraph("Nothing needs your attention this time. Here is where "+now.Month().String()+" stands:"))
	}

	blocks = append(blocks,
		mail.FactList{
			{Label: "Earned income", Value: formatMinorAsMoney(insight.EarnedIncome, currency)},
			{Label: "Living expenses", Value: formatMinorAsMoney(insight.LivingExpenses, currency)},
			{Label: "Debt payments", Value: formatMinorAsMoney(insight.DebtPrincipalPaid+insight.DebtInterestFees, currency)},
			{Label: "Saved", Value: formatMinorAsMoney(insight.Savings, currency)},
			{Label: "Invested", Value: formatMinorAsMoney(insight.Investments, currency)},
			{Label: "Free cash flow", Value: formatMinorAsMoney(insight.FreeCashFlow, currency)},
		},
		mail.Button{Label: "Open Inscribed Expenses", URL: publicURL + "/today"},
	)

	return mail.Document{
		Preheader:  digestPreheader(items),
		Heading:    digestSubject(recipient.Frequency, now),
		Blocks:     blocks,
		FooterNote: "You receive this because email summaries are on. Change what you get, or turn them off, in Settings › Preferences.",
	}, true
}

func digestPreheader(items []notificationItem) string {
	switch len(items) {
	case 0:
		return "Nothing needs your attention."
	case 1:
		return "1 thing needs your attention."
	default:
		return fmt.Sprintf("%d things need your attention.", len(items))
	}
}

// StartDigestScheduler runs scheduled mail in the API process. A separate
// worker container was the alternative; on a 2 GB host already running several
// apps, a ticker in a process that is up anyway costs nothing extra. It assumes
// a single API instance — the delivery log's dedupe key is what keeps a second
// one from double-sending if that ever changes.
func (s *Server) StartDigestScheduler(ctx context.Context) {
	if !s.config.MailEnabled() {
		log.Print("digest: SMTP is not configured, scheduled email is disabled")
		return
	}

	go func() {
		ticker := time.NewTicker(digestTick)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.runDigestPass(ctx, time.Now())
			}
		}
	}()

	log.Printf("digest: scheduler running, checking every %s", digestTick)
}

func (s *Server) runDigestPass(ctx context.Context, now time.Time) {
	recipients, err := s.userPreferences.ListDigestSubscribers(ctx)
	if err != nil {
		log.Printf("digest: could not list subscribers: %v", err)
		return
	}

	for _, recipient := range recipients {
		if !digestIsDue(recipient.Frequency, recipient.LastSentAt, now) {
			continue
		}
		if err := s.sendDigest(ctx, recipient, now); err != nil {
			// One person's failure must not stop everybody else's mail.
			log.Printf("digest: could not send to user %s: %v", recipient.UserID, err)
		}
	}

	if removed, err := s.authTokens.DeleteExpired(ctx); err != nil {
		log.Printf("digest: could not sweep expired tokens: %v", err)
	} else if removed > 0 {
		log.Printf("digest: swept %d expired auth tokens", removed)
	}
}

func (s *Server) sendDigest(ctx context.Context, recipient store.DigestRecipient, now time.Time) error {
	data, _, err := s.monthlyInsights(ctx, recipient.UserID, recipient.DefaultCurrency, now.Year())
	if err != nil {
		return fmt.Errorf("monthly insights: %w", err)
	}
	insight := data[int(now.Month())-1]

	loans, err := s.loans.ListByUser(ctx, recipient.UserID)
	if err != nil {
		return fmt.Errorf("loans: %w", err)
	}

	items := buildNotifications(notificationInputs{
		Insight:  insight,
		Loans:    loans,
		Currency: recipient.DefaultCurrency,
		AsOf:     now,
	})

	document, worthSending := buildDigestDocument(recipient, insight, items, s.config.AppPublicURL, now)
	if !worthSending {
		// Still recorded as done, or every tick for the rest of the day would
		// rebuild the same empty digest.
		return s.userPreferences.RecordDigestSent(ctx, recipient.UserID, now)
	}

	err = s.mailer.send(ctx, outgoing{
		UserID:    &recipient.UserID,
		Recipient: recipient.Email,
		Kind:      store.EmailKindDigest,
		Subject:   digestSubject(recipient.Frequency, now),
		DedupeKey: fmt.Sprintf("digest:%s:%s:%s", recipient.UserID, recipient.Frequency, digestPeriodKey(recipient.Frequency, now)),
		Document:  document,
	})
	if err != nil && !errors.Is(err, store.ErrEmailAlreadySent) {
		return err
	}

	return s.userPreferences.RecordDigestSent(ctx, recipient.UserID, now)
}
