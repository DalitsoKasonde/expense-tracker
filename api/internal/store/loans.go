package store

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Loan struct {
	ID                 string  `json:"id"`
	UserID             string  `json:"userId"`
	LiabilityAccountID string  `json:"liabilityAccountId"`
	CreditorName       string  `json:"creditorName"`
	LoanType           string  `json:"loanType"`
	InterestMethod     string  `json:"interestMethod"`
	InterestRateBPS    *int    `json:"interestRateBps"`
	FixedInterestMinor int64   `json:"fixedInterestMinor"`
	StatedPeriodEnd    *string `json:"statedPeriodEnd"`
	IsForced           bool    `json:"isForced"`
	GroupID            *string `json:"groupId"`
	Status             string  `json:"status"`
	OpenedAt           string  `json:"openedAt"`
	CreatedAt          string  `json:"createdAt"`
	UpdatedAt          string  `json:"updatedAt"`
}

type LoanSummary struct {
	Loan
	PrincipalBorrowed       int64  `json:"principalBorrowed"`
	PrincipalRepaid         int64  `json:"principalRepaid"`
	RemainingPrincipal      int64  `json:"remainingPrincipal"`
	InterestCharged         int64  `json:"interestCharged"`
	FeesCharged             int64  `json:"feesCharged"`
	InterestPaid            int64  `json:"interestPaid"`
	FeesPaid                int64  `json:"feesPaid"`
	OutstandingInterest     int64  `json:"outstandingInterest"`
	OutstandingFees         int64  `json:"outstandingFees"`
	TotalRemainingBalance   int64  `json:"totalRemainingBalance"`
	TotalPaid               int64  `json:"totalPaid"`
	InterestAndFeesPaid     int64  `json:"interestAndFeesPaid"`
	AvailablePayoffPriority string `json:"availablePayoffPriority"`
}

type CreateLoanInput struct {
	CreditorName       string  `json:"creditorName"`
	LoanType           string  `json:"loanType"`
	InterestMethod     string  `json:"interestMethod"`
	InterestRateBPS    *int    `json:"interestRateBps"`
	FixedInterestMinor int64   `json:"fixedInterestMinor"`
	StatedPeriodEnd    *string `json:"statedPeriodEnd"`
	IsForced           bool    `json:"isForced"`
	GroupID            *string `json:"groupId"`
	OpenedAt           string  `json:"openedAt"`
	Currency           string  `json:"currency"`
}

type RecordBorrowedInput struct {
	LoanID          string `json:"loanId"`
	CashAccountID   string `json:"cashAccountId"`
	AmountMinor     int64  `json:"amountMinor"`
	Currency        string `json:"currency"`
	TransactionDate string `json:"transactionDate"`
	Note            string `json:"note"`
}

type RecordRepaymentInput struct {
	LoanID          string `json:"loanId"`
	CashAccountID   string `json:"cashAccountId"`
	AmountMinor     int64  `json:"amountMinor"`
	Currency        string `json:"currency"`
	TransactionDate string `json:"transactionDate"`
	Note            string `json:"note"`
}

type LoanRepaymentResult struct {
	OriginEventID  string        `json:"originEventId"`
	FeesPaid       int64         `json:"feesPaid"`
	InterestPaid   int64         `json:"interestPaid"`
	PrincipalPaid  int64         `json:"principalPaid"`
	Transactions   []Transaction `json:"transactions"`
	UpdatedSummary LoanSummary   `json:"updatedSummary"`
}

type LoanStore struct {
	db *pgxpool.Pool
}

func NewLoanStore(db *pgxpool.Pool) *LoanStore {
	return &LoanStore{db: db}
}

func (s *LoanStore) ListByUser(ctx context.Context, userID string) ([]LoanSummary, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, liability_account_id, creditor_name, loan_type, interest_method,
		       interest_rate_bps, fixed_interest_minor, stated_period_end::text, is_forced,
		       group_id, status, opened_at::text, created_at::text, updated_at::text
		from loans
		where user_id = $1
		order by status asc, creditor_name asc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	summaries := make([]LoanSummary, 0)
	for rows.Next() {
		var loan Loan
		if err := rows.Scan(
			&loan.ID,
			&loan.UserID,
			&loan.LiabilityAccountID,
			&loan.CreditorName,
			&loan.LoanType,
			&loan.InterestMethod,
			&loan.InterestRateBPS,
			&loan.FixedInterestMinor,
			&loan.StatedPeriodEnd,
			&loan.IsForced,
			&loan.GroupID,
			&loan.Status,
			&loan.OpenedAt,
			&loan.CreatedAt,
			&loan.UpdatedAt,
		); err != nil {
			return nil, err
		}
		summary, err := s.summaryForLoan(ctx, loan)
		if err != nil {
			return nil, err
		}
		summaries = append(summaries, summary)
	}

	return summaries, rows.Err()
}

func (s *LoanStore) GetSummary(ctx context.Context, userID, loanID string) (LoanSummary, error) {
	loan, err := s.getLoan(ctx, userID, loanID)
	if err != nil {
		return LoanSummary{}, err
	}
	return s.summaryForLoan(ctx, loan)
}

func (s *LoanStore) Create(ctx context.Context, userID string, input CreateLoanInput) (LoanSummary, error) {
	name := strings.TrimSpace(input.CreditorName)
	if name == "" {
		return LoanSummary{}, errors.New("creditor name is required")
	}
	if input.LoanType == "" {
		input.LoanType = "personal"
	}
	if input.InterestMethod == "" {
		input.InterestMethod = "fixed"
	}
	if input.Currency == "" {
		input.Currency = "ZMW"
	}
	if input.OpenedAt == "" {
		input.OpenedAt = "now"
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return LoanSummary{}, err
	}
	defer tx.Rollback(ctx)

	var accountID string
	if err := tx.QueryRow(ctx, `
		insert into accounts (user_id, name, account_type, account_class, currency)
		values ($1, $2, 'other', 'liability', $3)
		returning id
	`, userID, fmt.Sprintf("%s liability", name), input.Currency).Scan(&accountID); err != nil {
		return LoanSummary{}, normalizeWriteError(err)
	}

	openedAtSQL := input.OpenedAt
	if openedAtSQL == "now" {
		openedAtSQL = ""
	}
	var loan Loan
	err = tx.QueryRow(ctx, `
		insert into loans (
			user_id, liability_account_id, creditor_name, loan_type, interest_method,
			interest_rate_bps, fixed_interest_minor, stated_period_end, is_forced, group_id,
			opened_at
		)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, coalesce(nullif($11, '')::date, current_date))
		returning id, user_id, liability_account_id, creditor_name, loan_type, interest_method,
		          interest_rate_bps, fixed_interest_minor, stated_period_end::text, is_forced,
		          group_id, status, opened_at::text, created_at::text, updated_at::text
	`, userID, accountID, name, input.LoanType, input.InterestMethod, input.InterestRateBPS,
		input.FixedInterestMinor, input.StatedPeriodEnd, input.IsForced, input.GroupID, openedAtSQL).Scan(
		&loan.ID,
		&loan.UserID,
		&loan.LiabilityAccountID,
		&loan.CreditorName,
		&loan.LoanType,
		&loan.InterestMethod,
		&loan.InterestRateBPS,
		&loan.FixedInterestMinor,
		&loan.StatedPeriodEnd,
		&loan.IsForced,
		&loan.GroupID,
		&loan.Status,
		&loan.OpenedAt,
		&loan.CreatedAt,
		&loan.UpdatedAt,
	)
	if err != nil {
		return LoanSummary{}, normalizeWriteError(err)
	}

	if err := tx.Commit(ctx); err != nil {
		return LoanSummary{}, err
	}

	return s.summaryForLoan(ctx, loan)
}

func (s *LoanStore) RecordBorrowed(ctx context.Context, userID string, input RecordBorrowedInput) (LoanRepaymentResult, error) {
	if input.AmountMinor <= 0 {
		return LoanRepaymentResult{}, errors.New("amount must be greater than zero")
	}
	if input.TransactionDate == "" {
		return LoanRepaymentResult{}, errors.New("transaction date is required")
	}
	if input.Currency == "" {
		input.Currency = "ZMW"
	}

	loan, err := s.getLoan(ctx, userID, input.LoanID)
	if err != nil {
		return LoanRepaymentResult{}, err
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return LoanRepaymentResult{}, err
	}
	defer tx.Rollback(ctx)

	var originEventID string
	if err := tx.QueryRow(ctx, `select gen_random_uuid()::text`).Scan(&originEventID); err != nil {
		return LoanRepaymentResult{}, err
	}
	originType := "borrowed_money"
	note := input.Note
	if strings.TrimSpace(note) == "" {
		note = "Borrowed from " + loan.CreditorName
	}

	created := make([]Transaction, 0, 2)
	cashTx, err := insertLoanTransaction(ctx, tx, Transaction{
		UserID:          userID,
		TransactionDate: input.TransactionDate,
		EntryKind:       "income_borrowed",
		Amount:          input.AmountMinor,
		Currency:        input.Currency,
		AccountID:       input.CashAccountID,
		LoanID:          &loan.ID,
		Note:            &note,
		Source:          "manual",
		OriginEventID:   &originEventID,
		OriginEventType: &originType,
	})
	if err != nil {
		return LoanRepaymentResult{}, err
	}
	created = append(created, cashTx)

	liabilityNote := "Liability increase for " + loan.CreditorName
	liabilityTx, err := insertLoanTransaction(ctx, tx, Transaction{
		UserID:          userID,
		TransactionDate: input.TransactionDate,
		EntryKind:       "income_borrowed",
		Amount:          input.AmountMinor,
		Currency:        input.Currency,
		AccountID:       loan.LiabilityAccountID,
		LoanID:          &loan.ID,
		Note:            &liabilityNote,
		Source:          "manual",
		OriginEventID:   &originEventID,
		OriginEventType: &originType,
	})
	if err != nil {
		return LoanRepaymentResult{}, err
	}
	created = append(created, liabilityTx)

	if err := tx.Commit(ctx); err != nil {
		return LoanRepaymentResult{}, err
	}

	summary, err := s.GetSummary(ctx, userID, loan.ID)
	if err != nil {
		return LoanRepaymentResult{}, err
	}

	return LoanRepaymentResult{
		OriginEventID:  originEventID,
		Transactions:   created,
		UpdatedSummary: summary,
	}, nil
}

func (s *LoanStore) RecordRepayment(ctx context.Context, userID string, input RecordRepaymentInput) (LoanRepaymentResult, error) {
	if input.AmountMinor <= 0 {
		return LoanRepaymentResult{}, errors.New("amount must be greater than zero")
	}
	if input.TransactionDate == "" {
		return LoanRepaymentResult{}, errors.New("transaction date is required")
	}
	if input.Currency == "" {
		input.Currency = "ZMW"
	}

	summary, err := s.GetSummary(ctx, userID, input.LoanID)
	if err != nil {
		return LoanRepaymentResult{}, err
	}

	remaining := input.AmountMinor
	feesPaid := minInt64(remaining, summary.OutstandingFees)
	remaining -= feesPaid
	interestPaid := minInt64(remaining, summary.OutstandingInterest)
	remaining -= interestPaid
	principalPaid := minInt64(remaining, summary.RemainingPrincipal)
	remaining -= principalPaid
	if remaining > 0 {
		return LoanRepaymentResult{}, errors.New("repayment exceeds total outstanding balance")
	}
	if feesPaid+interestPaid+principalPaid == 0 {
		return LoanRepaymentResult{}, errors.New("loan has no outstanding balance")
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return LoanRepaymentResult{}, err
	}
	defer tx.Rollback(ctx)

	var originEventID string
	if err := tx.QueryRow(ctx, `select gen_random_uuid()::text`).Scan(&originEventID); err != nil {
		return LoanRepaymentResult{}, err
	}
	originType := "loan_repayment"
	note := input.Note
	if strings.TrimSpace(note) == "" {
		note = "Loan repayment to " + summary.CreditorName
	}

	created := make([]Transaction, 0, 3)
	if feesPaid > 0 {
		feeNote := note + " - fees"
		item, err := insertLoanTransaction(ctx, tx, Transaction{
			UserID:          userID,
			TransactionDate: input.TransactionDate,
			EntryKind:       "expense_fee",
			Amount:          feesPaid,
			Currency:        input.Currency,
			AccountID:       input.CashAccountID,
			LoanID:          &summary.ID,
			Note:            &feeNote,
			Source:          "manual",
			OriginEventID:   &originEventID,
			OriginEventType: &originType,
		})
		if err != nil {
			return LoanRepaymentResult{}, err
		}
		created = append(created, item)
	}

	if interestPaid > 0 {
		interestNote := note + " - interest"
		item, err := insertLoanTransaction(ctx, tx, Transaction{
			UserID:          userID,
			TransactionDate: input.TransactionDate,
			EntryKind:       "expense_interest",
			Amount:          interestPaid,
			Currency:        input.Currency,
			AccountID:       input.CashAccountID,
			LoanID:          &summary.ID,
			Note:            &interestNote,
			Source:          "manual",
			OriginEventID:   &originEventID,
			OriginEventType: &originType,
		})
		if err != nil {
			return LoanRepaymentResult{}, err
		}
		created = append(created, item)
	}

	if principalPaid > 0 {
		principalNote := note + " - principal"
		dest := summary.LiabilityAccountID
		item, err := insertLoanTransaction(ctx, tx, Transaction{
			UserID:               userID,
			TransactionDate:      input.TransactionDate,
			EntryKind:            "debt_principal_payment",
			Amount:               principalPaid,
			Currency:             input.Currency,
			AccountID:            input.CashAccountID,
			DestinationAccountID: &dest,
			LoanID:               &summary.ID,
			Note:                 &principalNote,
			Source:               "manual",
			OriginEventID:        &originEventID,
			OriginEventType:      &originType,
		})
		if err != nil {
			return LoanRepaymentResult{}, err
		}
		created = append(created, item)
	}

	if feesPaid == summary.OutstandingFees && interestPaid == summary.OutstandingInterest && principalPaid == summary.RemainingPrincipal {
		if _, err := tx.Exec(ctx, `
			update loans
			set status = 'closed', updated_at = now()
			where id = $1 and user_id = $2
		`, summary.ID, userID); err != nil {
			return LoanRepaymentResult{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return LoanRepaymentResult{}, err
	}

	updated, err := s.GetSummary(ctx, userID, summary.ID)
	if err != nil {
		return LoanRepaymentResult{}, err
	}

	return LoanRepaymentResult{
		OriginEventID:  originEventID,
		FeesPaid:       feesPaid,
		InterestPaid:   interestPaid,
		PrincipalPaid:  principalPaid,
		Transactions:   created,
		UpdatedSummary: updated,
	}, nil
}

func (s *LoanStore) getLoan(ctx context.Context, userID, loanID string) (Loan, error) {
	var loan Loan
	err := s.db.QueryRow(ctx, `
		select id, user_id, liability_account_id, creditor_name, loan_type, interest_method,
		       interest_rate_bps, fixed_interest_minor, stated_period_end::text, is_forced,
		       group_id, status, opened_at::text, created_at::text, updated_at::text
		from loans
		where id = $1 and user_id = $2
	`, loanID, userID).Scan(
		&loan.ID,
		&loan.UserID,
		&loan.LiabilityAccountID,
		&loan.CreditorName,
		&loan.LoanType,
		&loan.InterestMethod,
		&loan.InterestRateBPS,
		&loan.FixedInterestMinor,
		&loan.StatedPeriodEnd,
		&loan.IsForced,
		&loan.GroupID,
		&loan.Status,
		&loan.OpenedAt,
		&loan.CreatedAt,
		&loan.UpdatedAt,
	)
	return loan, normalizeWriteError(err)
}

func (s *LoanStore) summaryForLoan(ctx context.Context, loan Loan) (LoanSummary, error) {
	summary := LoanSummary{Loan: loan}
	if err := s.db.QueryRow(ctx, `
		select
			coalesce(sum(case when account_id = $2 and entry_kind = 'income_borrowed' then amount else 0 end), 0)::bigint,
			coalesce(sum(case when destination_account_id = $2 and entry_kind = 'debt_principal_payment' then amount else 0 end), 0)::bigint,
			coalesce(sum(case when entry_kind = 'expense_interest' then amount else 0 end), 0)::bigint,
			coalesce(sum(case when entry_kind = 'expense_fee' then amount else 0 end), 0)::bigint
		from transactions
		where user_id = $1
		  and loan_id = $3
		  and deleted_at is null
	`, loan.UserID, loan.LiabilityAccountID, loan.ID).Scan(
		&summary.PrincipalBorrowed,
		&summary.PrincipalRepaid,
		&summary.InterestPaid,
		&summary.FeesPaid,
	); err != nil {
		return LoanSummary{}, err
	}

	if err := s.db.QueryRow(ctx, `
		select
			coalesce(sum(case when charge_type = 'interest' then amount_minor else 0 end), 0)::bigint,
			coalesce(sum(case when charge_type = 'fee' then amount_minor else 0 end), 0)::bigint
		from loan_charges
		where user_id = $1 and loan_id = $2
	`, loan.UserID, loan.ID).Scan(&summary.InterestCharged, &summary.FeesCharged); err != nil {
		return LoanSummary{}, err
	}

	summary.InterestCharged += loan.FixedInterestMinor
	summary.RemainingPrincipal = maxInt64(0, summary.PrincipalBorrowed-summary.PrincipalRepaid)
	summary.OutstandingInterest = maxInt64(0, summary.InterestCharged-summary.InterestPaid)
	summary.OutstandingFees = maxInt64(0, summary.FeesCharged-summary.FeesPaid)
	summary.TotalRemainingBalance = summary.RemainingPrincipal + summary.OutstandingInterest + summary.OutstandingFees
	summary.InterestAndFeesPaid = summary.InterestPaid + summary.FeesPaid
	summary.TotalPaid = summary.PrincipalRepaid + summary.InterestAndFeesPaid
	if loan.IsForced {
		summary.AvailablePayoffPriority = "forced"
	} else if summary.OutstandingInterest+summary.OutstandingFees > 0 {
		summary.AvailablePayoffPriority = "high_cost"
	} else if summary.RemainingPrincipal <= 500000 {
		summary.AvailablePayoffPriority = "quick_win"
	} else {
		summary.AvailablePayoffPriority = "standard"
	}

	return summary, nil
}

func insertLoanTransaction(ctx context.Context, tx pgx.Tx, item Transaction) (Transaction, error) {
	note := ""
	if item.Note != nil {
		note = *item.Note
	}
	fees := int64(0)
	if item.Fees != nil {
		fees = *item.Fees
	}

	var result Transaction
	err := tx.QueryRow(ctx, `
		insert into transactions (
			user_id, transaction_date, entry_kind, amount, currency, account_id, destination_account_id,
			category_id, income_source_id, business_id, asset_id, loan_id, quantity, unit_price, fees,
			note, source, import_id, origin_event_id, origin_event_type
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
		returning id, user_id, transaction_date::text, entry_kind, amount::bigint, currency, account_id, destination_account_id,
		          category_id, income_source_id, business_id, asset_id, loan_id, quantity, unit_price::bigint, fees::bigint,
		          note, source, import_id, origin_event_id::text, origin_event_type, deleted_at::text, created_at::text, updated_at::text
	`, item.UserID, item.TransactionDate, item.EntryKind, item.Amount, item.Currency, item.AccountID, item.DestinationAccountID,
		item.CategoryID, item.IncomeSourceID, item.BusinessID, item.AssetID, item.LoanID, item.Quantity, item.UnitPrice, fees,
		note, item.Source, item.ImportID, item.OriginEventID, item.OriginEventType).Scan(
		&result.ID,
		&result.UserID,
		&result.TransactionDate,
		&result.EntryKind,
		&result.Amount,
		&result.Currency,
		&result.AccountID,
		&result.DestinationAccountID,
		&result.CategoryID,
		&result.IncomeSourceID,
		&result.BusinessID,
		&result.AssetID,
		&result.LoanID,
		&result.Quantity,
		&result.UnitPrice,
		&result.Fees,
		&result.Note,
		&result.Source,
		&result.ImportID,
		&result.OriginEventID,
		&result.OriginEventType,
		&result.DeletedAt,
		&result.CreatedAt,
		&result.UpdatedAt,
	)
	return result, err
}

func minInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
