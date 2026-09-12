package mail

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"time"
)

const smtpDialTimeout = 20 * time.Second

// SMTPSender delivers over a relay. Resend, Brevo, Mailgun and Gmail are all
// reached this way; only the host and credentials differ.
type SMTPSender struct {
	host     string
	port     int
	username string
	password string
	from     mail.Address
	replyTo  string
}

// NewSMTPSender fails fast on a half-configured relay: a host with no from
// address would produce mail every provider rejects, and finding that out at
// send time means losing a password reset.
func NewSMTPSender(host string, port int, username, password, fromAddress, fromName, replyTo string) (*SMTPSender, error) {
	if host == "" {
		return nil, fmt.Errorf("mail: SMTP_HOST is required")
	}
	if fromAddress == "" {
		return nil, fmt.Errorf("mail: MAIL_FROM_ADDRESS is required when SMTP_HOST is set")
	}
	if _, err := mail.ParseAddress(fromAddress); err != nil {
		return nil, fmt.Errorf("mail: MAIL_FROM_ADDRESS is not a valid email address: %w", err)
	}
	if replyTo != "" {
		if _, err := mail.ParseAddress(replyTo); err != nil {
			return nil, fmt.Errorf("mail: MAIL_REPLY_TO is not a valid email address: %w", err)
		}
	}
	if port <= 0 {
		port = 587
	}

	return &SMTPSender{
		host:     host,
		port:     port,
		username: username,
		password: password,
		from:     mail.Address{Name: fromName, Address: fromAddress},
		replyTo:  replyTo,
	}, nil
}

func (s *SMTPSender) Configured() bool { return true }

func (s *SMTPSender) Send(ctx context.Context, msg Message) error {
	// A caller may set its own Reply-To; otherwise the deployment's applies.
	if msg.ReplyTo == "" {
		msg.ReplyTo = s.replyTo
	}

	body, err := Render(s.from, msg, time.Now())
	if err != nil {
		return err
	}

	client, err := s.dial(ctx)
	if err != nil {
		return err
	}
	defer client.Close()

	if s.username != "" {
		auth := smtp.PlainAuth("", s.username, s.password, s.host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("mail: authenticate to %s: %w", s.host, err)
		}
	}

	if err := client.Mail(s.from.Address); err != nil {
		return fmt.Errorf("mail: set sender: %w", err)
	}
	for _, recipient := range msg.To {
		if err := client.Rcpt(recipient); err != nil {
			return fmt.Errorf("mail: add recipient: %w", err)
		}
	}

	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("mail: open data: %w", err)
	}
	if _, err := writer.Write(body); err != nil {
		return fmt.Errorf("mail: write body: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("mail: close body: %w", err)
	}

	return client.Quit()
}

// usesImplicitTLS reports whether the port expects TLS from the first byte
// rather than a STARTTLS upgrade.
//
// The 2xxx variants exist because many hosts — DigitalOcean among them — block
// outbound 25, 465 and 587 by default to contain spam, so providers publish
// high-numbered equivalents. 2465 is the implicit-TLS one and mirrors 465;
// missing it here would hang a connection rather than fail it, which is a
// miserable thing to debug from a log that says nothing.
func usesImplicitTLS(port int) bool {
	return port == 465 || port == 2465
}

// dial handles both relay styles: implicit TLS ports expect TLS immediately,
// while 587, 2587 and 2525 open in the clear and upgrade with STARTTLS. Getting
// this wrong hangs rather than erroring, so the port decides rather than a guess.
func (s *SMTPSender) dial(ctx context.Context) (*smtp.Client, error) {
	address := net.JoinHostPort(s.host, strconv.Itoa(s.port))
	dialer := &net.Dialer{Timeout: smtpDialTimeout}

	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, fmt.Errorf("mail: dial %s: %w", address, err)
	}
	if usesImplicitTLS(s.port) {
		conn = tls.Client(conn, &tls.Config{ServerName: s.host})
	}

	client, err := smtp.NewClient(conn, s.host)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("mail: connect %s: %w", address, err)
	}

	if !usesImplicitTLS(s.port) {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{ServerName: s.host}); err != nil {
				client.Close()
				return nil, fmt.Errorf("mail: start tls with %s: %w", s.host, err)
			}
		}
	}

	return client, nil
}
