package mail

import (
	"encoding/base64"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"strings"
	"testing"
	"time"
)

func testAddress() mail.Address {
	return mail.Address{Name: "Inscribed Expenses", Address: "no-reply@inscribed.co.zm"}
}

func TestRenderProducesBothAlternativesSoTextClientsAreNotLeftBlank(t *testing.T) {
	raw, err := Render(testAddress(), Message{
		To:      []string{"person@example.com"},
		Subject: "Your weekly summary",
		HTML:    "<p>Hello</p>",
		Text:    "Hello",
	}, time.Now())
	if err != nil {
		t.Fatalf("Render returned an error: %v", err)
	}

	parsed, err := mail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("rendered message is not valid RFC 5322: %v", err)
	}

	mediaType, params, err := mime.ParseMediaType(parsed.Header.Get("Content-Type"))
	if err != nil {
		t.Fatalf("Content-Type is not parseable: %v", err)
	}
	if mediaType != "multipart/alternative" {
		t.Fatalf("Content-Type = %q, want multipart/alternative", mediaType)
	}

	reader := multipart.NewReader(parsed.Body, params["boundary"])
	var types []string
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("reading part: %v", err)
		}
		partType, _, err := mime.ParseMediaType(part.Header.Get("Content-Type"))
		if err != nil {
			t.Fatalf("part Content-Type is not parseable: %v", err)
		}
		types = append(types, partType)
	}

	if len(types) != 2 || types[0] != "text/plain" || types[1] != "text/html" {
		t.Fatalf("parts = %v, want [text/plain text/html] in that order", types)
	}
}

func TestRenderEncodesNonASCIISubjectsSoHeadersStayValid(t *testing.T) {
	raw, err := Render(testAddress(), Message{
		To:      []string{"person@example.com"},
		Subject: "Spending summary — K1,250 over budget",
		HTML:    "<p>Hi</p>",
		Text:    "Hi",
	}, time.Now())
	if err != nil {
		t.Fatalf("Render returned an error: %v", err)
	}

	parsed, err := mail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("rendered message is not valid RFC 5322: %v", err)
	}

	decoder := new(mime.WordDecoder)
	subject, err := decoder.DecodeHeader(parsed.Header.Get("Subject"))
	if err != nil {
		t.Fatalf("decoding subject: %v", err)
	}
	if subject != "Spending summary — K1,250 over budget" {
		t.Fatalf("subject round-tripped as %q", subject)
	}
}

// A display name or subject is user-influenced in places, so a newline in one
// must not be able to append headers of its own.
func TestRenderStripsNewlinesFromHeadersSoHeadersCannotBeInjected(t *testing.T) {
	raw, err := Render(testAddress(), Message{
		To:      []string{"person@example.com\r\nBcc: attacker@example.com"},
		Subject: "Hello",
		HTML:    "<p>Hi</p>",
		Text:    "Hi",
	}, time.Now())
	if err != nil {
		t.Fatalf("Render returned an error: %v", err)
	}

	parsed, err := mail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("rendered message is not valid RFC 5322: %v", err)
	}
	if got := parsed.Header.Get("Bcc"); got != "" {
		t.Fatalf("injected Bcc header survived as %q", got)
	}
}

func TestRenderRejectsMessagesThatCannotBeDelivered(t *testing.T) {
	if _, err := Render(testAddress(), Message{Subject: "Hi", Text: "Hi"}, time.Now()); err == nil {
		t.Fatal("expected an error for a message with no recipients")
	}
	if _, err := Render(testAddress(), Message{To: []string{"a@example.com"}, Text: "Hi"}, time.Now()); err == nil {
		t.Fatal("expected an error for a message with no subject")
	}
}

func TestDocumentRendersEveryBlockIntoTheTextAlternative(t *testing.T) {
	doc := Document{
		Preheader:  "Two things need attention",
		Heading:    "Your week in Inscribed Expenses",
		FooterNote: "You receive this because email digests are on.",
		Blocks: []Block{
			Paragraph("Here is what stood out."),
			Alert{Title: "Free cash flow is negative", Body: "You spent more than you earned.", Level: "warning", URL: "https://expenses.inscribed.co.zm/reports"},
			FactList{{Label: "Money in", Value: "K12,000.00"}, {Label: "Money out", Value: "K13,500.00"}},
			Button{Label: "Open Inscribed Expenses", URL: "https://expenses.inscribed.co.zm"},
		},
	}

	htmlBody, textBody := doc.Render()

	for _, want := range []string{"Your week in Inscribed Expenses", "Free cash flow is negative", "K13,500.00", "https://expenses.inscribed.co.zm/reports"} {
		if !strings.Contains(textBody, want) {
			t.Errorf("text alternative is missing %q", want)
		}
		if !strings.Contains(htmlBody, want) {
			t.Errorf("html body is missing %q", want)
		}
	}
	if !strings.Contains(textBody, "You receive this because email digests are on.") {
		t.Error("text alternative dropped the footer explaining why the mail arrived")
	}
}

func TestDocumentEscapesContentSoAmountsAndNamesCannotBreakTheMarkup(t *testing.T) {
	doc := Document{Blocks: []Block{Paragraph(`Note: <script>alert("x")</script>`)}}
	htmlBody, _ := doc.Render()

	if strings.Contains(htmlBody, "<script>") {
		t.Fatal("user content was interpolated into the email as live markup")
	}
}

func TestNewSMTPSenderRefusesAHalfConfiguredRelay(t *testing.T) {
	if _, err := NewSMTPSender("", 587, "resend", "key", "no-reply@inscribed.co.zm", "Inscribed Expenses", ""); err == nil {
		t.Error("expected an error when the host is missing")
	}
	if _, err := NewSMTPSender("smtp.resend.com", 587, "resend", "key", "", "Inscribed Expenses", ""); err == nil {
		t.Error("expected an error when the from address is missing")
	}
	if _, err := NewSMTPSender("smtp.resend.com", 587, "resend", "key", "not-an-address", "Inscribed Expenses", ""); err == nil {
		t.Error("expected an error when the from address is malformed")
	}
	// A malformed reply address would be dropped into every outgoing header.
	if _, err := NewSMTPSender("smtp.resend.com", 587, "resend", "key", "no-reply@inscribed.co.zm", "Inscribed Expenses", "nope"); err == nil {
		t.Error("expected an error when the reply-to address is malformed")
	}
}

// The From address sits on a domain that need not host a mailbox, so replies
// have to be redirected explicitly or they go nowhere.
func TestRenderCarriesReplyToSoRepliesReachARealInbox(t *testing.T) {
	raw, err := Render(testAddress(), Message{
		To:      []string{"person@example.com"},
		Subject: "Reset your password",
		ReplyTo: "support@example.com",
		HTML:    "<p>Hi</p>",
		Text:    "Hi",
	}, time.Now())
	if err != nil {
		t.Fatalf("Render returned an error: %v", err)
	}

	parsed, err := mail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("rendered message is not valid RFC 5322: %v", err)
	}
	if got := parsed.Header.Get("Reply-To"); got != "support@example.com" {
		t.Fatalf("Reply-To = %q", got)
	}
}

func TestRenderOmitsReplyToWhenNoneIsConfigured(t *testing.T) {
	raw, err := Render(testAddress(), Message{
		To:      []string{"person@example.com"},
		Subject: "Reset your password",
		HTML:    "<p>Hi</p>",
		Text:    "Hi",
	}, time.Now())
	if err != nil {
		t.Fatalf("Render returned an error: %v", err)
	}

	parsed, err := mail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("rendered message is not valid RFC 5322: %v", err)
	}
	if got := parsed.Header.Get("Reply-To"); got != "" {
		t.Fatalf("an empty Reply-To was written as %q", got)
	}
}

func TestRenderWrapsAttachmentsAroundTheBodyAlternatives(t *testing.T) {
	raw, err := Render(testAddress(), Message{
		To:      []string{"person@example.com"},
		Subject: "Your statement",
		HTML:    "<p>Attached</p>",
		Text:    "Attached",
		Attachments: []Attachment{{
			Filename:    "statement-2026.csv",
			ContentType: "text/csv; charset=utf-8",
			Content:     []byte("month,earned\nJanuary,120000\n"),
		}},
	}, time.Now())
	if err != nil {
		t.Fatalf("Render returned an error: %v", err)
	}

	parsed, err := mail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("rendered message is not valid RFC 5322: %v", err)
	}

	mediaType, params, err := mime.ParseMediaType(parsed.Header.Get("Content-Type"))
	if err != nil {
		t.Fatalf("Content-Type is not parseable: %v", err)
	}
	if mediaType != "multipart/mixed" {
		t.Fatalf("Content-Type = %q, want multipart/mixed once a file is attached", mediaType)
	}

	reader := multipart.NewReader(parsed.Body, params["boundary"])
	var sawAlternative bool
	var attachedBody string
	var attachedName string
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("reading part: %v", err)
		}
		partType, _, err := mime.ParseMediaType(part.Header.Get("Content-Type"))
		if err != nil {
			t.Fatalf("part Content-Type is not parseable: %v", err)
		}
		if partType == "multipart/alternative" {
			sawAlternative = true
			continue
		}
		attachedName = part.FileName()
		if encoding := part.Header.Get("Content-Transfer-Encoding"); encoding != "base64" {
			t.Fatalf("attachment Content-Transfer-Encoding = %q, want base64", encoding)
		}
		// multipart.Reader decodes quoted-printable but not base64, so the
		// attachment is decoded here the way a mail client would.
		decoded, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, part))
		if err != nil {
			t.Fatalf("decoding attachment: %v", err)
		}
		attachedBody = string(decoded)
	}

	if !sawAlternative {
		t.Error("the text and html alternatives were lost when a file was attached")
	}
	if attachedName != "statement-2026.csv" {
		t.Errorf("attachment filename = %q", attachedName)
	}
	if !strings.Contains(attachedBody, "January,120000") {
		t.Errorf("attachment content did not survive encoding: %q", attachedBody)
	}
}

// Choosing the wrong TLS style for a port hangs the connection instead of
// failing it, so the classification is pinned rather than trusted to a glance.
func TestPortsThatExpectTLSImmediatelyAreRecognised(t *testing.T) {
	for _, port := range []int{465, 2465} {
		if !usesImplicitTLS(port) {
			t.Errorf("port %d should use implicit TLS", port)
		}
	}
	// 2587 is the alternate for 587 and still upgrades with STARTTLS; hosts
	// that block 587 outbound make it the port a deployment actually uses.
	for _, port := range []int{25, 587, 2525, 2587} {
		if usesImplicitTLS(port) {
			t.Errorf("port %d should upgrade with STARTTLS, not open in TLS", port)
		}
	}
}

func TestRenderMarksServiceMailAsAutoGenerated(t *testing.T) {
	raw, err := Render(
		mail.Address{Name: "Inscribed Expenses", Address: "no-reply@inscribed.co.zm"},
		Message{To: []string{"reader@example.com"}, Subject: "Reset your password", HTML: "<p>hi</p>", Text: "hi", AutoGenerated: true},
		time.Date(2026, 9, 12, 8, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Auto-Submitted: auto-generated", "X-Auto-Response-Suppress: All"} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("expected header %q in:\n%s", want, raw)
		}
	}
}

// A password reset is not a mailing list. Advertising an unsubscribe on one
// tells a filter the message is bulk, which is the opposite of what a security
// email needs.
func TestRenderOmitsListUnsubscribeFromTransactionalMail(t *testing.T) {
	raw, err := Render(
		mail.Address{Address: "no-reply@inscribed.co.zm"},
		Message{To: []string{"reader@example.com"}, Subject: "Your sign-in code", HTML: "<p>hi</p>", Text: "hi", AutoGenerated: true},
		time.Date(2026, 9, 12, 8, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "List-Unsubscribe") {
		t.Errorf("transactional mail should carry no List-Unsubscribe:\n%s", raw)
	}
}

func TestRenderClaimsOneClickOnlyWhenItIsHonoured(t *testing.T) {
	base := Message{To: []string{"reader@example.com"}, Subject: "Your week", HTML: "<p>hi</p>", Text: "hi"}
	base.ListUnsubscribe = "https://expenses.inscribed.co.zm/settings/preferences"

	raw, err := Render(mail.Address{Address: "no-reply@inscribed.co.zm"}, base, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "List-Unsubscribe: <https://expenses.inscribed.co.zm/settings/preferences>") {
		t.Errorf("expected the unsubscribe header:\n%s", raw)
	}
	// No endpoint POSTs the subscription away, so the header must not promise one.
	if strings.Contains(string(raw), "List-Unsubscribe-Post") {
		t.Errorf("one-click must not be claimed without an endpoint:\n%s", raw)
	}

	base.ListUnsubscribeOneClick = true
	raw, err = Render(mail.Address{Address: "no-reply@inscribed.co.zm"}, base, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "List-Unsubscribe-Post: List-Unsubscribe=One-Click") {
		t.Errorf("expected one-click when it is honoured:\n%s", raw)
	}
}

// The chrome is the point of the split: newsletter furniture on a security
// code is what gets it filed beside the marketing.
func TestLetterWearsNoMastheadAndBulletinDoes(t *testing.T) {
	blocks := []Block{Paragraph("hello")}

	letter, _ := Document{Heading: "Sign in", Blocks: blocks}.Render()
	if strings.Contains(letter, "border-radius:16px") {
		t.Errorf("a letter should not sit in a card:\n%s", letter)
	}
	if strings.Contains(letter, colourPageBackground) {
		t.Errorf("a letter should sit on plain white, not a tinted page:\n%s", letter)
	}
	if strings.Contains(letter, "border-radius:999px") {
		t.Errorf("a letter should carry no pill-shaped call to action:\n%s", letter)
	}

	bulletin, _ := Document{Heading: "Your week", Style: Bulletin, Blocks: blocks}.Render()
	if !strings.Contains(bulletin, "border-radius:16px") || !strings.Contains(bulletin, colourPageBackground) {
		t.Errorf("a bulletin should keep its card on a tinted page:\n%s", bulletin)
	}
}

func TestCodeRendersTheValueInBothBodies(t *testing.T) {
	html, text := Document{Blocks: []Block{Code{Label: "Sign-in code", Value: "418205"}}}.Render()
	if !strings.Contains(html, "418205") || !strings.Contains(html, "Sign-in code") {
		t.Errorf("code missing from html:\n%s", html)
	}
	if !strings.Contains(text, "Sign-in code: 418205") {
		t.Errorf("code missing from text:\n%s", text)
	}
}

// Outlook blocks images by default, so a masthead that is only an image leaves
// the top of the message blank.
func TestMastheadFallsBackToTextWithoutAnImage(t *testing.T) {
	withLogo, _ := Document{LogoURL: "https://expenses.inscribed.co.zm/inscribed-logo.png", Blocks: []Block{Paragraph("hi")}}.Render()
	if !strings.Contains(withLogo, `alt="Inscribed"`) {
		t.Errorf("expected the wordmark image:\n%s", withLogo)
	}

	withoutLogo, _ := Document{Blocks: []Block{Paragraph("hi")}}.Render()
	if strings.Contains(withoutLogo, "<img") {
		t.Errorf("no logo URL means no image tag:\n%s", withoutLogo)
	}
	if !strings.Contains(withoutLogo, ">Inscribed<") {
		t.Errorf("expected the text wordmark as the fallback:\n%s", withoutLogo)
	}
}
