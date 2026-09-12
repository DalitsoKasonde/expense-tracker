package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/dalitsokasonde/expense-tracker/api/internal/mail"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

// outgoing is one email about to be sent.
type outgoing struct {
	UserID    *string
	Recipient string
	Kind      string
	Subject   string
	// DedupeKey, when set, makes the send happen at most once ever. Scheduled
	// mail sets it so a restart cannot produce a duplicate; mail a person asked
	// for by pressing a button leaves it empty, because asking twice should
	// send twice.
	DedupeKey   string
	Document    mail.Document
	Attachments []mail.Attachment
}

// mailer joins the SMTP sender to the delivery log. Nothing else in the app
// calls the sender directly, so every message that leaves is recorded.
type mailer struct {
	sender     mail.Sender
	deliveries *store.EmailDeliveryStore
	publicURL  string
}

// send claims the delivery first and transmits second. Claiming first means a
// crash between the two is recorded as a send that may not have arrived, which
// is the safer direction to be wrong for money-related mail: a missed digest is
// a nuisance, a duplicate looks like a duplicate transaction.
func (m *mailer) send(ctx context.Context, message outgoing) error {
	recipient := strings.TrimSpace(message.Recipient)
	if recipient == "" {
		return errors.New("email has no recipient")
	}

	id, err := m.deliveries.Claim(ctx, message.UserID, recipient, message.Kind, message.Subject, message.DedupeKey)
	if err != nil {
		return err
	}

	htmlBody, textBody := message.Document.Render()
	sendErr := m.sender.Send(ctx, mail.Message{
		To:          []string{recipient},
		Subject:     message.Subject,
		HTML:        htmlBody,
		Text:        textBody,
		Attachments: message.Attachments,
	})
	if sendErr != nil {
		if markErr := m.deliveries.MarkFailed(ctx, id, sendErr); markErr != nil {
			log.Printf("mail: could not record failed delivery %s: %v", id, markErr)
		}
		return sendErr
	}

	return nil
}

// link builds an absolute URL into the web app. Emails are read outside the
// app, so every link has to carry the origin.
func (m *mailer) link(path string) string {
	return m.publicURL + "/" + strings.TrimPrefix(path, "/")
}

// tokenLink builds a link carrying a one-time secret, escaping it so a token
// containing a URL-significant character cannot truncate the address.
func (m *mailer) tokenLink(path, token string) string {
	return fmt.Sprintf("%s?token=%s", m.link(path), url.QueryEscape(token))
}

// greeting addresses someone by first name where there is one. A display name
// is free text, so it may be a full name, a single word, or blank.
func greeting(displayName string) string {
	name := strings.TrimSpace(displayName)
	if name == "" {
		return "Hello,"
	}
	if first, _, found := strings.Cut(name, " "); found && first != "" {
		name = first
	}
	return "Hello " + name + ","
}
