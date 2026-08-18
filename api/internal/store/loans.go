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
	InterestTermMonths *int    `json:"interestTermMonths"`
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
	CreditorName        string  `json:"creditorName"`
	LoanType            string  `json:"loanType"`
	InterestMethod      string  `json:"interestMethod"`
	InterestRateBPS     *int    `json:"interestRateBps"`
	InterestTermMonths  *int    `json:"interestTermMonths"`
	FixedInterestMinor  int64   `json:"fixedInterestMinor"`
	StatedPeriodEnd     *string `json:"statedPeriodEnd"`
	IsForced            bool    `json:"isForced"`
	GroupID             *string `json:"groupId"`
	OpenedAt            string  `json:"openedAt"`
	Currency            string  `json:"currency"`
	InitialAmountMinor  int64   `json:"initialAmountMinor"`
	CashAccountID       string  `json:"cashAccountId"`
	TransactionFeeMinor int64   `json:"transactionFeeMinor"`
	TransactionDate     string  `json:"transactionDate"`
	Note                string  `json:"note"`
}

// UpdateLoanInput replaces a loan's editable fields. It mirrors CreateLoanInput
// rather than doing a partial patch, since the edit form always submits the
// full set of current values. PrincipalAmountMinor, when set, corrects the
// amount recorded on the loan's earliest borrowed-money transaction pair.
type UpdateLoanInput struct {
	CreditorName         string  `json:"creditorName"`
	LoanType             string  `json:"loanType"`
	InterestMethod       string  `json:"interestMethod"`
	InterestRateBPS      *int    `json:"interestRateBps"`
	InterestTermMonths   *int    `json:"interestTermMonths"`
	FixedInterestMinor   int64   `json:"fixedInterestMinor"`
	StatedPeriodEnd      *string `json:"statedPeriodEnd"`
	IsForced             bool    `json:"isForced"`
	PrincipalAmountMinor *int64  `json:"principalAmountMinor"`
}

type RecordBorrowedInput struct {
	LoanID              string `json:"loanId"`
	CashAccountID       string `json:"cashAccountId"`
	AmountMinor         int64  `json:"amountMinor"`
	TransactionFeeMinor int64  `json:"transactionFeeMinor"`
	Currency            string `json:"currency"`
	TransactionDate     string `json:"transactionDate"`
	Note                string `json:"note"`
}

type RecordRepaymentInput struct {
	LoanID              string `json:"loanId"`
	CashAccountID       string `json:"cashAccountId"`
	AmountMinor         int64  `json:"amountMinor"`
	TransactionFeeMinor int64  `json:"transactionFeeMinor"`
	Currency            string `json:"currency"`
	TransactionDate     string `json:"transactionDate"`
	Note                string `json:"note"`
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
		       interest_rate_bps, interest_term_months, fixed_interest_minor, stated_period_end::text, is_forced,
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
			&loan.InterestTermMonths,
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
	if input.InitialAmountMinor < 0 {
		return LoanSummary{}, errors.New("initial amount cannot be negative")
	}
	if input.TransactionFeeMinor < 0 {
		return LoanSummary{}, errors.New("transaction fee cannot be negative")
	}
	if input.InitialAmountMinor > 0 && input.CashAccountID == "" {
		return LoanSummary{}, errors.New("destination account is required")
	}
	if input.InitialAmountMinor > 0 && input.TransactionDate == "" {
		input.TransactionDate = input.OpenedAt
		if input.TransactionDate == "now" {
			input.TransactionDate = ""
		}
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return LoanSummary{}, err
	}
	defer tx.Rollback(ctx)
	if input.GroupID != nil {
		var groupCurrency string
		if err := tx.QueryRow(ctx, `
			select sg.name, a.currency
			from savings_groups sg
			join accounts a on a.id = sg.account_id
			where sg.id = $1 and sg.user_id = $2
		`, *input.GroupID, userID).Scan(&name, &groupCurrency); err != nil {
			return LoanSummary{}, normalizeWriteError(err)
		}
		if groupCurrency != input.Currency {
			return LoanSummary{}, errors.New("loan and savings group currencies must match")
		}
	}
	if name == "" {
		return LoanSummary{}, errors.New("creditor name is required")
	}

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
			interest_rate_bps, interest_term_months, fixed_interest_minor, stated_period_end, is_forced, group_id,
			opened_at
		)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce(nullif($12, '')::date, current_date))
		returning id, user_id, liability_account_id, creditor_name, loan_type, interest_method,
		          interest_rate_bps, interest_term_months, fixed_interest_minor, stated_period_end::text, is_forced,
		          group_id, status, opened_at::text, created_at::text, updated_at::text
	`, userID, accountID, name, input.LoanType, input.InterestMethod, input.InterestRateBPS, input.InterestTermMonths,
		input.FixedInterestMinor, input.StatedPeriodEnd, input.IsForced, input.GroupID, openedAtSQL).Scan(
		&loan.ID,
		&loan.UserID,
		&loan.LiabilityAccountID,
		&loan.CreditorName,
		&loan.LoanType,
		&loan.InterestMethod,
		&loan.InterestRateBPS,
		&loan.InterestTermMonths,
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
	if input.InitialAmountMinor > 0 {
		if _, err := s.recordBorrowedWithTx(ctx, tx, userID, loan, RecordBorrowedInput{
			LoanID: loan.ID, CashAccountID: input.CashAccountID, AmountMinor: input.InitialAmountMinor,
			TransactionFeeMinor: input.TransactionFeeMinor, Currency: input.Currency,
			TransactionDate: input.TransactionDate, Note: input.Note,
		}); err != nil {
			return LoanSummary{}, err
		}
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
	if input.TransactionFeeMinor < 0 {
		return LoanRepaymentResult{}, errors.New("transaction fee cannot be negative")
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

	result, err := s.recordBorrowedWithTx(ctx, tx, userID, loan, input)
	if err != nil {
		return LoanRepaymentResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return LoanRepaymentResult{}, err
	}

	summary, err := s.GetSummary(ctx, userID, loan.ID)
	if err != nil {
		return LoanRepaymentResult{}, err
	}
	result.UpdatedSummary = summary
	return result, nil
}

func (s *LoanStore) recordBorrowedWithTx(ctx context.Context, tx pgx.Tx, userID string, loan Loan, input RecordBorrowedInput) (LoanRepaymentResult, error) {
	transactionDate := input.TransactionDate
	if transactionDate == "" {
		transactionDate = loan.OpenedAt
	}
	if err := validateLoanCashAccount(ctx, tx, userID, input.CashAccountID, input.Currency); err != nil {
		return LoanRepaymentResult{}, err
	}
	var originEventID string
	if err := tx.QueryRow(ctx, `select gen_random_uuid()::text`).Scan(&originEventID); err != nil {
		return LoanRepaymentResult{}, err
	}
	originType := "borrowed_money"
	note := input.Note
	if strings.TrimSpace(note) == "" {
		note = "Borrowed from " + loan.CreditorName
	}
	created := make([]Transaction, 0, 3)
	cashTx, err := insertLoanTransaction(ctx, tx, Transaction{
		UserID:          userID,
		TransactionDate: transactionDate,
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
		return LoanRepaymentResult{}, normalizeWriteError(err)
	}
	created = append(created, cashTx)

	liabilityNote := "Liability increase for " + loan.CreditorName
	liabilityTx, err := insertLoanTransaction(ctx, tx, Transaction{
		UserID:          userID,
		TransactionDate: transactionDate,
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
		return LoanRepaymentResult{}, normalizeWriteError(err)
	}
	created = append(created, liabilityTx)
	if input.TransactionFeeMinor > 0 {
		feeTx, err := NewTransactionStore(s.db).CreateMovementFeeWithTx(ctx, tx, cashTx, input.CashAccountID, input.TransactionFeeMinor)
		if err != nil {
			return LoanRepaymentResult{}, normalizeWriteError(err)
		}
		created = append(created, feeTx)
	}

	// A fully repaid loan is closed, but the same lender/loan can be used again.
	// Reopen it in the same database transaction as the new principal so status
	// and balance can never disagree after a successful borrow.
	if loan.Status == "closed" {
		if _, err := tx.Exec(ctx, `
			update loans
			set status = 'active', updated_at = now()
			where id = $1 and user_id = $2 and status = 'closed'
		`, loan.ID, userID); err != nil {
			return LoanRepaymentResult{}, normalizeWriteError(err)
		}
	}

	return LoanRepaymentResult{
		OriginEventID: originEventID,
		Transactions:  created,
	}, nil
}

func (s *LoanStore) RecordRepayment(ctx context.Context, userID string, input RecordRepaymentInput) (LoanRepaymentResult, error) {
	if input.AmountMinor <= 0 {
		return LoanRepaymentResult{}, errors.New("amount must be greater than zero")
	}
	if input.TransactionFeeMinor < 0 {
		return LoanRepaymentResult{}, errors.New("transaction fee cannot be negative")
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
	if err := validateLoanCashAccount(ctx, tx, userID, input.CashAccountID, input.Currency); err != nil {
		return LoanRepaymentResult{}, err
	}

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
	if input.TransactionFeeMinor > 0 {
		feeMovement := Transaction{
			UserID: userID, TransactionDate: input.TransactionDate, Currency: input.Currency,
			AccountID: input.CashAccountID, Note: &note, Source: "manual",
			OriginEventID: &originEventID, OriginEventType: &originType,
		}
		feeTx, err := NewTransactionStore(s.db).CreateMovementFeeWithTx(ctx, tx, feeMovement, input.CashAccountID, input.TransactionFeeMinor)
		if err != nil {
			return LoanRepaymentResult{}, err
		}
		created = append(created, feeTx)
	}
	if summary.GroupID != nil {
		var groupAccountID string
		if err := tx.QueryRow(ctx, `
			select account_id
			from savings_groups
			where id = $1 and user_id = $2
		`, *summary.GroupID, userID).Scan(&groupAccountID); err != nil {
			return LoanRepaymentResult{}, normalizeWriteError(err)
		}
		groupNote := "Loan repayment returned to " + summary.CreditorName
		groupTx, err := insertLoanTransaction(ctx, tx, Transaction{
			UserID: userID, TransactionDate: input.TransactionDate,
			EntryKind: "savings_group_loan_repayment", Amount: input.AmountMinor,
			Currency: input.Currency, AccountID: groupAccountID, LoanID: &summary.ID,
			Note: &groupNote, Source: "manual", OriginEventID: &originEventID,
			OriginEventType: &originType,
		})
		if err != nil {
			return LoanRepaymentResult{}, normalizeWriteError(err)
		}
		created = append(created, groupTx)
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
		       interest_rate_bps, interest_term_months, fixed_interest_minor, stated_period_end::text, is_forced,
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
		&loan.InterestTermMonths,
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

func (s *LoanStore) Update(ctx context.Context, userID, loanID string, input UpdateLoanInput) (LoanSummary, error) {
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
	if input.InterestMethod == "percentage" {
		if input.InterestRateBPS == nil || *input.InterestRateBPS < 0 {
			return LoanSummary{}, errors.New("a monthly interest rate is required")
		}
		if input.InterestTermMonths == nil || *input.InterestTermMonths <= 0 {
			return LoanSummary{}, errors.New("the loan term in months is required")
		}
	}
	if input.FixedInterestMinor < 0 {
		return LoanSummary{}, errors.New("interest cannot be negative")
	}
	if input.PrincipalAmountMinor != nil && *input.PrincipalAmountMinor <= 0 {
		return LoanSummary{}, errors.New("loan amount must be greater than zero")
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return LoanSummary{}, err
	}
	defer tx.Rollback(ctx)

	if input.PrincipalAmountMinor != nil {
		var originEventID string
		var currentAmount int64
		err := tx.QueryRow(ctx, `
			select origin_event_id, amount
			from transactions
			where loan_id = $1 and user_id = $2 and entry_kind = 'income_borrowed' and deleted_at is null
			order by transaction_date asc, created_at asc
			limit 1
		`, loanID, userID).Scan(&originEventID, &currentAmount)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return LoanSummary{}, errors.New("this loan has no recorded borrowed amount to edit")
			}
			return LoanSummary{}, err
		}
		if *input.PrincipalAmountMinor != currentAmount {
			if _, err := tx.Exec(ctx, `
				update transactions
				set amount = $1, updated_at = now()
				where loan_id = $2 and user_id = $3 and origin_event_id = $4 and entry_kind = 'income_borrowed'
			`, *input.PrincipalAmountMinor, loanID, userID, originEventID); err != nil {
				return LoanSummary{}, normalizeWriteError(err)
			}
		}
	}

	tag, err := tx.Exec(ctx, `
		update loans
		set creditor_name = $1, loan_type = $2, interest_method = $3, interest_rate_bps = $4,
		    interest_term_months = $5, fixed_interest_minor = $6, stated_period_end = $7,
		    is_forced = $8, updated_at = now()
		where id = $9 and user_id = $10
	`, name, input.LoanType, input.InterestMethod, input.InterestRateBPS, input.InterestTermMonths,
		input.FixedInterestMinor, input.StatedPeriodEnd, input.IsForced, loanID, userID)
	if err != nil {
		return LoanSummary{}, normalizeWriteError(err)
	}
	if tag.RowsAffected() == 0 {
		return LoanSummary{}, ErrNotFound
	}

	if err := tx.Commit(ctx); err != nil {
		return LoanSummary{}, err
	}

	return s.GetSummary(ctx, userID, loanID)
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

	if loan.InterestMethod == "percentage" && loan.InterestRateBPS != nil && loan.InterestTermMonths != nil {
		// Simple interest: rate is a monthly percentage (stored in basis points),
		// charged for interestTermMonths against the total amount ever borrowed.
		summary.InterestCharged += summary.PrincipalBorrowed * int64(*loan.InterestRateBPS) * int64(*loan.InterestTermMonths) / 10000
	} else {
		summary.InterestCharged += loan.FixedInterestMinor
	}
	summary.RemainingPrincipal = maxInt64(0, summary.PrincipalBorrowed-summary.PrincipalRepaid)
	summary.OutstandingInterest = maxInt64(0, summary.InterestCharged-summary.InterestPaid)
	summary.OutstandingFees = maxInt64(0, summary.FeesCharged-summary.FeesPaid)
	summary.TotalRemainingBalance = summary.RemainingPrincipal + summary.OutstandingInterest + summary.OutstandingFees
	// Repair summaries created before borrowing explicitly reopened a closed
	// loan. This makes an existing positive balance immediately usable again,
	// while preserving other meaningful states such as defaulted.
	summary.Status = effectiveLoanStatus(summary.Status, summary.TotalRemainingBalance)
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

func effectiveLoanStatus(status string, totalRemainingBalance int64) string {
	if status == "closed" && totalRemainingBalance > 0 {
		return "active"
	}
	return status
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
	var accountID *string
	err := tx.QueryRow(ctx, `
		insert into transactions (
			user_id, transaction_date, entry_kind, amount, currency, account_id, destination_account_id,
			category_id, income_source_id, business_id, asset_id, loan_id, quantity, unit_price, fees,
			note, source, import_id, origin_event_id, origin_event_type
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
		returning id, user_id, transaction_date::text, entry_kind, amount::bigint, currency, account_id, destination_account_id,
		          category_id, income_source_id, business_id, asset_id, loan_id, quantity, unit_price::bigint, fees::bigint,
		          note, source, import_id, origin_event_id::text, origin_event_type, deleted_at::text, created_at::text, updated_at::text
	`, item.UserID, item.TransactionDate, item.EntryKind, item.Amount, item.Currency, nullableAccountID(item.AccountID), item.DestinationAccountID,
		item.CategoryID, item.IncomeSourceID, item.BusinessID, item.AssetID, item.LoanID, item.Quantity, item.UnitPrice, fees,
		note, item.Source, item.ImportID, item.OriginEventID, item.OriginEventType).Scan(
		&result.ID,
		&result.UserID,
		&result.TransactionDate,
		&result.EntryKind,
		&result.Amount,
		&result.Currency,
		&accountID,
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
	if accountID != nil {
		result.AccountID = *accountID
	}
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

func validateLoanCashAccount(ctx context.Context, tx pgx.Tx, userID, accountID, currency string) error {
	var valid bool
	if err := tx.QueryRow(ctx, `
		select exists (
			select 1 from accounts
			where id = $1 and user_id = $2 and currency = $3 and account_class = 'asset'
		)
	`, accountID, userID, currency).Scan(&valid); err != nil {
		return err
	}
	if !valid {
		return errors.New("select an account in the loan currency")
	}
	return nil
}
