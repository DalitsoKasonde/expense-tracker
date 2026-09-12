package mail

import (
	"fmt"
	"html"
	"strings"
)

// Email is the one place in the codebase where a colour is written as a
// literal. The design system's rule — colour lives in globals.css tokens —
// assumes a browser: mail clients strip <style> blocks and none of them
// resolve CSS custom properties, so every colour has to be inline and literal.
// These values are copied from the light palette in web/app/globals.css so a
// notification email reads as the same product; update them together.
const (
	colourPageBackground = "#f4f8fc"
	colourSurface        = "#ffffff"
	colourBorder         = "#e4e9f1"
	colourPrimary        = "#264e86"
	colourPrimaryDeep    = "#112545"
	colourText           = "#1b2238"
	colourTextMuted      = "#5d6a85"
	colourActionContrast = "#ffffff"
	colourWarning        = "#9a5b00"
	colourWarningSoft    = "#fff3d6"
	colourNegative       = "#b4233f"
	colourNegativeSoft   = "#fbe8ec"
	colourInfoSoft       = "#edf4fc"
)

// Quicksand is a webfont, and mail clients will not load it. The stack falls
// through to whatever the reader's system provides rather than pretending.
const fontStack = "'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// Block is one piece of an email body. Every block renders both HTML and plain
// text from the same data, which is what stops the two alternatives drifting
// apart as templates change.
type Block interface {
	html() string
	text() string
}

// Document assembles blocks into a finished message. Callers build one of
// these instead of writing markup, so every email shares a layout and footer.
type Document struct {
	// Preheader is the grey line a mail client shows next to the subject.
	// Without it clients scrape the first words of the body, which is usually
	// the greeting and tells the reader nothing.
	Preheader string
	Heading   string
	Blocks    []Block
	// FooterNote explains why this email arrived, which is both a courtesy and
	// what keeps automated mail out of the spam folder.
	FooterNote string
}

func (d Document) Render() (htmlBody string, textBody string) {
	var h, t strings.Builder

	h.WriteString(`<!doctype html><html><body style="margin:0;padding:0;background:` + colourPageBackground + `;">`)
	if d.Preheader != "" {
		h.WriteString(`<div style="display:none;max-height:0;overflow:hidden;opacity:0;">` + esc(d.Preheader) + `</div>`)
	}
	// Tables rather than flexbox: Outlook still renders with Word's engine,
	// which supports neither flex nor grid.
	h.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:` + colourPageBackground + `;padding:24px 12px;">`)
	h.WriteString(`<tr><td align="center">`)
	h.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:` + colourSurface + `;border:1px solid ` + colourBorder + `;border-radius:16px;overflow:hidden;">`)

	h.WriteString(`<tr><td style="background:` + colourPrimaryDeep + `;padding:20px 24px;">`)
	h.WriteString(`<span style="font-family:` + fontStack + `;font-size:18px;font-weight:700;color:` + colourActionContrast + `;letter-spacing:0.02em;">Chuma</span>`)
	h.WriteString(`</td></tr>`)

	h.WriteString(`<tr><td style="padding:24px;font-family:` + fontStack + `;font-size:15px;line-height:1.6;color:` + colourText + `;">`)
	if d.Heading != "" {
		h.WriteString(`<h1 style="margin:0 0 16px;font-family:` + fontStack + `;font-size:20px;line-height:1.3;color:` + colourPrimaryDeep + `;">` + esc(d.Heading) + `</h1>`)
		t.WriteString(d.Heading + "\n" + strings.Repeat("=", len(d.Heading)) + "\n\n")
	}
	for _, block := range d.Blocks {
		h.WriteString(block.html())
		t.WriteString(block.text())
	}
	h.WriteString(`</td></tr>`)

	if d.FooterNote != "" {
		h.WriteString(`<tr><td style="padding:16px 24px 24px;border-top:1px solid ` + colourBorder + `;font-family:` + fontStack + `;font-size:12px;line-height:1.5;color:` + colourTextMuted + `;">` + esc(d.FooterNote) + `</td></tr>`)
		t.WriteString("\n--\n" + d.FooterNote + "\n")
	}

	h.WriteString(`</table></td></tr></table></body></html>`)

	return h.String(), t.String()
}

// Paragraph is a run of body copy.
type Paragraph string

func (p Paragraph) html() string {
	return `<p style="margin:0 0 14px;font-family:` + fontStack + `;font-size:15px;line-height:1.6;color:` + colourText + `;">` + esc(string(p)) + `</p>`
}

func (p Paragraph) text() string { return string(p) + "\n\n" }

// Button is a call to action. The URL is repeated as text underneath because
// many clients block or rewrite links, and a reader who cannot click still
// needs the address.
type Button struct {
	Label string
	URL   string
}

func (b Button) html() string {
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr><td style="background:` + colourPrimary + `;border-radius:999px;">` +
		`<a href="` + esc(b.URL) + `" style="display:inline-block;padding:12px 24px;font-family:` + fontStack + `;font-size:15px;font-weight:600;color:` + colourActionContrast + `;text-decoration:none;">` + esc(b.Label) + `</a>` +
		`</td></tr></table>` +
		`<p style="margin:0 0 14px;font-family:` + fontStack + `;font-size:12px;line-height:1.5;color:` + colourTextMuted + `;word-break:break-all;">Or paste this into your browser: ` + esc(b.URL) + `</p>`
}

func (b Button) text() string {
	return b.Label + ":\n" + b.URL + "\n\n"
}

// Alert is one notification as it appears in a digest, tinted by level the way
// the in-app bell menu tints it.
type Alert struct {
	Title string
	Body  string
	Level string
	URL   string
}

func (a Alert) html() string {
	background, accent := colourInfoSoft, colourPrimary
	switch a.Level {
	case "warning":
		background, accent = colourWarningSoft, colourWarning
	case "critical":
		background, accent = colourNegativeSoft, colourNegative
	}

	var b strings.Builder
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;background:` + background + `;border-left:3px solid ` + accent + `;border-radius:8px;">`)
	b.WriteString(`<tr><td style="padding:14px 16px;font-family:` + fontStack + `;">`)
	b.WriteString(`<strong style="display:block;margin:0 0 4px;font-size:15px;color:` + colourPrimaryDeep + `;">` + esc(a.Title) + `</strong>`)
	b.WriteString(`<span style="font-size:14px;line-height:1.5;color:` + colourText + `;">` + esc(a.Body) + `</span>`)
	if a.URL != "" {
		b.WriteString(`<br><a href="` + esc(a.URL) + `" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:600;color:` + accent + `;">Open in Chuma &rarr;</a>`)
	}
	b.WriteString(`</td></tr></table>`)
	return b.String()
}

func (a Alert) text() string {
	line := "* " + a.Title + "\n  " + a.Body + "\n"
	if a.URL != "" {
		line += "  " + a.URL + "\n"
	}
	return line + "\n"
}

// Fact is a labelled figure. FactList renders them as a two-column table so
// amounts line up down the right edge.
type Fact struct {
	Label string
	Value string
}

type FactList []Fact

func (f FactList) html() string {
	if len(f) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border:1px solid ` + colourBorder + `;border-radius:10px;">`)
	for index, fact := range f {
		border := "border-top:1px solid " + colourBorder + ";"
		if index == 0 {
			border = ""
		}
		b.WriteString(`<tr>`)
		b.WriteString(`<td style="` + border + `padding:10px 14px;font-family:` + fontStack + `;font-size:14px;color:` + colourTextMuted + `;">` + esc(fact.Label) + `</td>`)
		// Figures use a monospace stack: Quicksand's digits are proportional,
		// and a column of amounts that does not line up looks broken.
		b.WriteString(`<td align="right" style="` + border + `padding:10px 14px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:14px;font-weight:600;color:` + colourText + `;white-space:nowrap;">` + esc(fact.Value) + `</td>`)
		b.WriteString(`</tr>`)
	}
	b.WriteString(`</table>`)
	return b.String()
}

func (f FactList) text() string {
	if len(f) == 0 {
		return ""
	}
	width := 0
	for _, fact := range f {
		if len(fact.Label) > width {
			width = len(fact.Label)
		}
	}
	var b strings.Builder
	for _, fact := range f {
		b.WriteString(fmt.Sprintf("%-*s  %s\n", width, fact.Label, fact.Value))
	}
	b.WriteString("\n")
	return b.String()
}

func esc(value string) string { return html.EscapeString(value) }
