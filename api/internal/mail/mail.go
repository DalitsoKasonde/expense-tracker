// Package mail renders and delivers the application's outgoing email.
//
// Delivery is plain SMTP rather than a provider SDK so that switching from
// Resend to Brevo or Gmail is a credential change and not a code change. A
// Sender is always present: when SMTP is unconfigured the log sender records
// what would have gone out, so development, tests and a half-provisioned
// deploy never fail a request just because mail has nowhere to go.
package mail

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log"
	"mime"
	"mime/quotedprintable"
	"net/mail"
	"strings"
	"time"
)

// Message is one email. Both bodies are required: HTML is what a person sees,
// and the plain-text alternative is what keeps the message out of spam folders
// and readable in a text client.
type Message struct {
	To          []string
	Subject     string
	HTML        string
	Text        string
	Attachments []Attachment
}

// Attachment is a file travelling with the message — a statement CSV, say.
// Content is the raw bytes; encoding for transport happens here.
type Attachment struct {
	Filename    string
	ContentType string
	Content     []byte
}

// Sender delivers a message. Implementations must be safe for concurrent use:
// the digest scheduler sends to many users from one goroutine while request
// handlers send password resets at the same time.
type Sender interface {
	Send(ctx context.Context, msg Message) error
	// Configured reports whether mail will actually leave the building.
	// Handlers use it to tell a user "check your email" only when that is true.
	Configured() bool
}

// LogSender is the fallback when no SMTP host is configured. It writes the
// subject and recipients to the log and reports success, so an unconfigured
// environment behaves like a working one minus the delivery.
type LogSender struct{}

func (LogSender) Send(_ context.Context, msg Message) error {
	log.Printf("mail: smtp not configured, skipping send to=%s subject=%q", strings.Join(msg.To, ","), msg.Subject)
	return nil
}

func (LogSender) Configured() bool { return false }

// Render builds the RFC 5322 message that goes on the wire. It is separate
// from sending so the exact bytes can be asserted in a test without a server.
func Render(from mail.Address, msg Message, sentAt time.Time) ([]byte, error) {
	if len(msg.To) == 0 {
		return nil, fmt.Errorf("mail: message has no recipients")
	}
	if strings.TrimSpace(msg.Subject) == "" {
		return nil, fmt.Errorf("mail: message has no subject")
	}

	alternative, err := randomBoundary()
	if err != nil {
		return nil, err
	}
	mixed, err := randomBoundary()
	if err != nil {
		return nil, err
	}

	var b strings.Builder
	writeHeader(&b, "From", from.String())
	writeHeader(&b, "To", strings.Join(msg.To, ", "))
	// Subjects carry names and currency symbols, so they are encoded rather
	// than written raw — a bare non-ASCII byte in a header is invalid.
	writeHeader(&b, "Subject", mime.QEncoding.Encode("utf-8", msg.Subject))
	writeHeader(&b, "Date", sentAt.Format(time.RFC1123Z))
	writeHeader(&b, "Message-ID", messageID(from.Address, sentAt))
	writeHeader(&b, "MIME-Version", "1.0")

	// With files attached the body is multipart/mixed wrapping the two body
	// alternatives; without them the wrapper would be an empty layer clients
	// sometimes render as a phantom attachment, so it is omitted.
	hasAttachments := len(msg.Attachments) > 0
	if hasAttachments {
		writeHeader(&b, "Content-Type", `multipart/mixed; boundary="`+mixed+`"`)
		b.WriteString("\r\n")
		b.WriteString("--" + mixed + "\r\n")
		b.WriteString(`Content-Type: multipart/alternative; boundary="` + alternative + `"` + "\r\n\r\n")
	} else {
		// multipart/alternative puts the richest acceptable part last, so
		// clients that understand HTML show it and text-only clients fall
		// back cleanly.
		writeHeader(&b, "Content-Type", `multipart/alternative; boundary="`+alternative+`"`)
		b.WriteString("\r\n")
	}

	if err := writePart(&b, alternative, "text/plain; charset=utf-8", msg.Text); err != nil {
		return nil, err
	}
	if err := writePart(&b, alternative, "text/html; charset=utf-8", msg.HTML); err != nil {
		return nil, err
	}
	b.WriteString("--" + alternative + "--\r\n")

	if hasAttachments {
		for _, attachment := range msg.Attachments {
			writeAttachment(&b, mixed, attachment)
		}
		b.WriteString("--" + mixed + "--\r\n")
	}

	return []byte(b.String()), nil
}

func writeAttachment(b *strings.Builder, boundary string, attachment Attachment) {
	contentType := attachment.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	// The filename is quoted and encoded because a comma or non-ASCII
	// character in it would otherwise split the header.
	filename := mime.QEncoding.Encode("utf-8", attachment.Filename)

	b.WriteString("--" + boundary + "\r\n")
	b.WriteString("Content-Type: " + contentType + "\r\n")
	b.WriteString(`Content-Disposition: attachment; filename="` + filename + `"` + "\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")

	encoded := base64.StdEncoding.EncodeToString(attachment.Content)
	// RFC 2045 caps an encoded line at 76 characters; some servers reject
	// anything longer rather than wrapping it for you.
	for len(encoded) > 76 {
		b.WriteString(encoded[:76] + "\r\n")
		encoded = encoded[76:]
	}
	b.WriteString(encoded + "\r\n")
}

func writeHeader(b *strings.Builder, name, value string) {
	// A newline smuggled into a header value would let a caller inject extra
	// headers or a second message body, so they are stripped, not escaped.
	value = strings.NewReplacer("\r", "", "\n", "").Replace(value)
	b.WriteString(name + ": " + value + "\r\n")
}

func writePart(b *strings.Builder, boundary, contentType, body string) error {
	b.WriteString("--" + boundary + "\r\n")
	b.WriteString("Content-Type: " + contentType + "\r\n")
	b.WriteString("Content-Transfer-Encoding: quoted-printable\r\n\r\n")

	writer := quotedprintable.NewWriter(b)
	if _, err := writer.Write([]byte(normalizeNewlines(body))); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	b.WriteString("\r\n")
	return nil
}

// normalizeNewlines makes line endings CRLF. Go source produces bare \n, and
// some SMTP servers reject a body whose lines do not end the way the protocol
// says they must.
func normalizeNewlines(body string) string {
	return strings.ReplaceAll(strings.ReplaceAll(body, "\r\n", "\n"), "\n", "\r\n")
}

func randomBoundary() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("mail: generate boundary: %w", err)
	}
	return "chuma-" + hex.EncodeToString(buf), nil
}

func messageID(fromAddress string, sentAt time.Time) string {
	domain := "localhost"
	if at := strings.LastIndex(fromAddress, "@"); at >= 0 && at+1 < len(fromAddress) {
		domain = fromAddress[at+1:]
	}
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		// A duplicate Message-ID is a threading nuisance, never a reason to
		// drop the email, so fall back to the clock.
		return fmt.Sprintf("<%d@%s>", sentAt.UnixNano(), domain)
	}
	return fmt.Sprintf("<%d.%s@%s>", sentAt.UnixNano(), hex.EncodeToString(buf), domain)
}
