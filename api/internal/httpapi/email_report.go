package httpapi

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/mail"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

// emailReport sends the signed-in person their own annual statement.
//
// The destination is always the account's own address. Letting a caller name
// an arbitrary recipient would turn an authenticated endpoint into a way to
// send mail from this domain to anyone, which costs the domain its sending
// reputation the first time it is abused.
func (s *Server) emailReport(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var request struct {
		Year int `json:"year"`
	}
	if err := decodeJSON(r, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	now := time.Now()
	year := request.Year
	if year == 0 {
		year = now.Year()
	}
	if year < 2000 || year > now.Year()+1 {
		http.Error(w, "year is out of range", http.StatusBadRequest)
		return
	}

	if !s.config.MailEnabled() {
		http.Error(w, "email is not configured on this server", http.StatusServiceUnavailable)
		return
	}

	user, err := s.users.FindByID(r.Context(), claims.UserID)
	if err != nil {
		writeInternalError(w, r, "reports.email.user", "the statement could not be sent", err)
		return
	}

	prefs, err := s.userPreferences.GetOrCreate(r.Context(), claims.UserID)
	if err != nil {
		writeInternalError(w, r, "reports.email.preferences", "the statement could not be sent", err)
		return
	}

	months, _, err := s.monthlyInsights(r.Context(), claims.UserID, prefs.DefaultCurrency, year)
	if err != nil {
		writeInternalError(w, r, "reports.email.insights", "the statement could not be sent", err)
		return
	}

	statement, err := buildStatementCSV(months, prefs.DefaultCurrency)
	if err != nil {
		writeInternalError(w, r, "reports.email.csv", "the statement could not be sent", err)
		return
	}

	totals := sumMonths(months)
	subject := fmt.Sprintf("Your %d Inscribed Expenses statement", year)
	document := mail.Document{
		Preheader: "The full month-by-month breakdown is attached as a spreadsheet.",
		Heading:   subject,
		Blocks: []mail.Block{
			mail.Paragraph(greeting(user.DisplayName)),
			mail.Paragraph(fmt.Sprintf("Here is how %d looks so far. The attached CSV has every month in full, ready to open in a spreadsheet.", year)),
			mail.FactList{
				{Label: "Earned income", Value: formatMinorAsMoney(totals.EarnedIncome, prefs.DefaultCurrency)},
				{Label: "Borrowed", Value: formatMinorAsMoney(totals.BorrowedIncome, prefs.DefaultCurrency)},
				{Label: "Living expenses", Value: formatMinorAsMoney(totals.LivingExpenses, prefs.DefaultCurrency)},
				{Label: "Debt payments", Value: formatMinorAsMoney(totals.DebtPrincipalPaid+totals.DebtInterestFees, prefs.DefaultCurrency)},
				{Label: "Saved", Value: formatMinorAsMoney(totals.Savings, prefs.DefaultCurrency)},
				{Label: "Invested", Value: formatMinorAsMoney(totals.Investments, prefs.DefaultCurrency)},
				{Label: "Free cash flow", Value: formatMinorAsMoney(totals.FreeCashFlow, prefs.DefaultCurrency)},
			},
			mail.Button{Label: "Open the full report", URL: s.mailer.link("/reports")},
		},
		FooterNote: "You asked for this statement from the Reports page.",
	}

	// No dedupe key: this is a button press, and pressing it twice should
	// produce two emails rather than silently doing nothing the second time.
	err = s.mailer.send(r.Context(), outgoing{
		UserID:    &user.ID,
		Recipient: user.Email,
		Kind:      store.EmailKindReport,
		Subject:   subject,
		Document:  document,
		Attachments: []mail.Attachment{{
			Filename:    fmt.Sprintf("inscribed-expenses-statement-%d.csv", year),
			ContentType: "text/csv; charset=utf-8",
			Content:     statement,
		}},
	})
	if err != nil {
		writeInternalError(w, r, "reports.email.send", "the statement could not be sent", err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"sentTo": user.Email})
}

// buildStatementCSV writes the year month by month. Amounts are written in
// major units with two decimals because this file is opened in a spreadsheet by
// a person, not parsed back by the app — the minor-unit integers stay internal.
func buildStatementCSV(months []monthlyInsight, currency string) ([]byte, error) {
	var buffer bytes.Buffer
	writer := csv.NewWriter(&buffer)

	if err := writer.Write([]string{
		"Month", "Currency", "Earned income", "Borrowed", "Living expenses",
		"Debt principal", "Interest and fees", "Saved", "Invested",
		"Free cash flow", "Ending cash balance", "Net worth",
	}); err != nil {
		return nil, err
	}

	for _, month := range months {
		if err := writer.Write([]string{
			month.MonthLabel,
			currency,
			minorToDecimal(month.EarnedIncome),
			minorToDecimal(month.BorrowedIncome),
			minorToDecimal(month.LivingExpenses),
			minorToDecimal(month.DebtPrincipalPaid),
			minorToDecimal(month.DebtInterestFees),
			minorToDecimal(month.Savings),
			minorToDecimal(month.Investments),
			minorToDecimal(month.FreeCashFlow),
			minorToDecimal(month.EndingCashBalance),
			minorToDecimal(month.NetWorth),
		}); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func minorToDecimal(amount int64) string {
	sign := ""
	if amount < 0 {
		sign = "-"
		amount = -amount
	}
	return sign + strconv.FormatInt(amount/100, 10) + "." + fmt.Sprintf("%02d", amount%100)
}

func sumMonths(months []monthlyInsight) monthlyInsight {
	var total monthlyInsight
	for _, month := range months {
		total.EarnedIncome += month.EarnedIncome
		total.BorrowedIncome += month.BorrowedIncome
		total.LivingExpenses += month.LivingExpenses
		total.DebtPrincipalPaid += month.DebtPrincipalPaid
		total.DebtInterestFees += month.DebtInterestFees
		total.Savings += month.Savings
		total.Investments += month.Investments
		total.FreeCashFlow += month.FreeCashFlow
	}
	return total
}

// notifyAdminOfFeedback tells the operator that something came in. It is
// deliberately fire-and-forget: a mail relay being slow or down must never turn
// a user's successful feedback submission into an error on their screen.
func (s *Server) notifyAdminOfFeedback(userEmail, message, pagePath string) {
	if s.config.AdminAlertEmail == "" || !s.config.MailEnabled() {
		return
	}

	page := pagePath
	if page == "" {
		page = "not recorded"
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		err := s.mailer.send(ctx, outgoing{
			Recipient: s.config.AdminAlertEmail,
			Kind:      store.EmailKindAdminAlert,
			Subject:   "New Inscribed Expenses feedback from " + userEmail,
			Document: mail.Document{
				Preheader: "Someone left feedback in the app.",
				Heading:   "New feedback",
				Blocks: []mail.Block{
					mail.FactList{
						{Label: "From", Value: userEmail},
						{Label: "Page", Value: page},
					},
					mail.Paragraph(message),
					mail.Button{Label: "Open the admin console", URL: s.mailer.link("/admin")},
				},
				FooterNote: "You receive this because ADMIN_ALERT_EMAIL is set for this deployment.",
			},
		})
		if err != nil {
			log.Printf("mail: could not send feedback alert: %v", err)
		}
	}()
}
