package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SavingsPocket struct {
	ID                    string `json:"id"`
	AccountID             string `json:"accountId"`
	Name                  string `json:"name"`
	Currency              string `json:"currency"`
	AnnualInterestRateBPS *int   `json:"annualInterestRateBps"`
	CurrentBalanceMinor   int64  `json:"currentBalanceMinor"`
	NetContributionsMinor int64  `json:"netContributionsMinor"`
	InterestEarnedMinor   int64  `json:"interestEarnedMinor"`
	CreatedAt             string `json:"createdAt"`
}

type CreateSavingsPocketInput struct {
	Name                  string
	Currency              string
	OpeningBalanceMinor   int64
	AnnualInterestRateBPS *int
	ExistingAccountID     string
}

type RecordSavingsPocketInterestInput struct {
	PocketID        string
	TransactionDate string
	AmountMinor     int64
	Note            string
}

type SavingsPocketStore struct{ db *pgxpool.Pool }

var ErrInvalidSavingsPocketAccount = errors.New("only a standalone savings account can become a savings pocket")

func NewSavingsPocketStore(db *pgxpool.Pool) *SavingsPocketStore {
	return &SavingsPocketStore{db: db}
}

func (s *SavingsPocketStore) ListByUser(ctx context.Context, userID string) ([]SavingsPocket, error) {
	rows, err := s.db.Query(ctx, `
		select
			sp.id,
			a.id,
			a.name,
			a.currency,
			sp.annual_interest_rate_bps,
			(
				coalesce(a.opening_balance, 0)::bigint
				+ coalesce(sum(case
					when t.account_id = a.id then case
						when t.entry_kind in ('income_earned', 'income_borrowed', 'investment_income', 'investment_sell', 'bond_principal_redemption', 'savings_group_loan_repayment') then t.amount::bigint
						when t.entry_kind in ('expense_living', 'expense_interest', 'expense_fee', 'saving_transfer', 'loan_receivable_advance', 'loan_receivable_repayment', 'investment_buy', 'investment_loss', 'debt_principal_payment') then -t.amount::bigint
						else 0 end
					when t.destination_account_id = a.id and t.entry_kind in ('saving_transfer', 'loan_receivable_advance', 'loan_receivable_repayment') then t.amount::bigint
					when t.destination_account_id = a.id and t.entry_kind = 'debt_principal_payment' then -t.amount::bigint
					else 0 end), 0)
			)::bigint as current_balance_minor,
			(
				coalesce(a.opening_balance, 0)::bigint
				+ coalesce(sum(case
					when t.entry_kind = 'saving_transfer' and t.destination_account_id = a.id then t.amount::bigint
					when t.entry_kind = 'saving_transfer' and t.account_id = a.id then -t.amount::bigint
					else 0 end), 0)
			)::bigint as net_contributions_minor,
			coalesce(sum(case when t.entry_kind = 'investment_income' and t.account_id = a.id then t.amount else 0 end), 0)::bigint as interest_earned_minor,
			sp.created_at::text
		from savings_pockets sp
		join accounts a on a.id = sp.account_id and a.user_id = sp.user_id
		left join transactions t on t.user_id = sp.user_id
			and t.deleted_at is null
			and t.currency = a.currency
			and (t.account_id = a.id or t.destination_account_id = a.id)
		where sp.user_id = $1 and a.archived_at is null
		group by sp.id, a.id
		order by sp.created_at desc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]SavingsPocket, 0)
	for rows.Next() {
		var item SavingsPocket
		if err := rows.Scan(&item.ID, &item.AccountID, &item.Name, &item.Currency, &item.AnnualInterestRateBPS, &item.CurrentBalanceMinor, &item.NetContributionsMinor, &item.InterestEarnedMinor, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *SavingsPocketStore) Create(ctx context.Context, userID string, input CreateSavingsPocketInput) (SavingsPocket, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return SavingsPocket{}, err
	}
	defer tx.Rollback(ctx)

	accountID := strings.TrimSpace(input.ExistingAccountID)
	if accountID == "" {
		if err := tx.QueryRow(ctx, `
			insert into accounts (user_id, name, account_type, account_class, currency, opening_balance)
			values ($1, $2, 'savings', 'asset', $3, $4)
			returning id
		`, userID, input.Name, input.Currency, input.OpeningBalanceMinor).Scan(&accountID); err != nil {
			return SavingsPocket{}, normalizeWriteError(err)
		}
	} else {
		var accountType, accountClass string
		var isSavingsGroup bool
		if err := tx.QueryRow(ctx, `
			select a.account_type, a.account_class, exists(select 1 from savings_groups sg where sg.account_id = a.id)
			from accounts a
			where a.id = $1 and a.user_id = $2 and a.archived_at is null
			for share
		`, accountID, userID).Scan(&accountType, &accountClass, &isSavingsGroup); err != nil {
			return SavingsPocket{}, normalizeWriteError(err)
		}
		if accountType != "savings" || accountClass != "asset" || isSavingsGroup {
			return SavingsPocket{}, ErrInvalidSavingsPocketAccount
		}
	}

	var pocketID string
	if err := tx.QueryRow(ctx, `
		insert into savings_pockets (user_id, account_id, annual_interest_rate_bps)
		values ($1, $2, $3)
		returning id
	`, userID, accountID, input.AnnualInterestRateBPS).Scan(&pocketID); err != nil {
		return SavingsPocket{}, normalizeWriteError(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return SavingsPocket{}, err
	}
	items, err := s.ListByUser(ctx, userID)
	if err != nil {
		return SavingsPocket{}, err
	}
	for _, item := range items {
		if item.ID == pocketID {
			return item, nil
		}
	}
	return SavingsPocket{}, ErrNotFound
}

func (s *SavingsPocketStore) RecordInterest(ctx context.Context, userID string, input RecordSavingsPocketInterestInput) (Transaction, error) {
	var accountID, currency string
	err := s.db.QueryRow(ctx, `
		select a.id, a.currency
		from savings_pockets sp
		join accounts a on a.id = sp.account_id and a.user_id = sp.user_id
		where sp.id = $1 and sp.user_id = $2 and a.archived_at is null
	`, input.PocketID, userID).Scan(&accountID, &currency)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Transaction{}, ErrNotFound
		}
		return Transaction{}, err
	}
	note := strings.TrimSpace(input.Note)
	if note == "" {
		note = "Savings pocket interest"
	}
	return createTransaction(ctx, s.db, Transaction{
		UserID:          userID,
		TransactionDate: input.TransactionDate,
		EntryKind:       "investment_income",
		Amount:          input.AmountMinor,
		Currency:        currency,
		AccountID:       accountID,
		Note:            &note,
		Source:          "manual",
	})
}
