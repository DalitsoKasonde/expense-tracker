package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Account struct {
	ID                  string  `json:"id"`
	UserID              string  `json:"userId"`
	Name                string  `json:"name"`
	AccountType         string  `json:"accountType"`
	AccountClass        string  `json:"accountClass"`
	Currency            string  `json:"currency"`
	OpeningBalanceMinor int64   `json:"openingBalanceMinor"`
	ArchivedAt          *string `json:"archivedAt"`
	CreatedAt           string  `json:"createdAt"`
}

type AccountStore struct {
	db *pgxpool.Pool
}

func NewAccountStore(db *pgxpool.Pool) *AccountStore {
	return &AccountStore{db: db}
}

func (s *AccountStore) ListByUser(ctx context.Context, userID string) ([]Account, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, name, account_type, account_class, currency, opening_balance::bigint, archived_at::text, created_at::text
		from accounts
		where user_id = $1 and archived_at is null
		order by created_at desc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	accounts := make([]Account, 0)
	for rows.Next() {
		var a Account
		if err := rows.Scan(&a.ID, &a.UserID, &a.Name, &a.AccountType, &a.AccountClass, &a.Currency, &a.OpeningBalanceMinor, &a.ArchivedAt, &a.CreatedAt); err != nil {
			return nil, err
		}
		accounts = append(accounts, a)
	}

	return accounts, rows.Err()
}

func (s *AccountStore) GetActiveByID(ctx context.Context, id, userID string) (Account, error) {
	var account Account
	err := s.db.QueryRow(ctx, `
		select id, user_id, name, account_type, account_class, currency, opening_balance::bigint, archived_at::text, created_at::text
		from accounts
		where id = $1 and user_id = $2 and archived_at is null
	`, id, userID).Scan(
		&account.ID,
		&account.UserID,
		&account.Name,
		&account.AccountType,
		&account.AccountClass,
		&account.Currency,
		&account.OpeningBalanceMinor,
		&account.ArchivedAt,
		&account.CreatedAt,
	)
	return account, normalizeWriteError(err)
}

func (s *AccountStore) Create(ctx context.Context, userID, name, accountType, accountClass, currency string, openingBalanceMinor int64) (Account, error) {
	var account Account
	if accountType == "" {
		accountType = "cash"
	}
	if accountClass == "" {
		accountClass = "asset"
	}
	if currency == "" {
		currency = "ZMW"
	}
	err := s.db.QueryRow(ctx, `
		insert into accounts (user_id, name, account_type, account_class, currency, opening_balance)
		values ($1, $2, $3, $4, $5, $6)
		returning id, user_id, name, account_type, account_class, currency, opening_balance::bigint, archived_at::text, created_at::text
	`, userID, name, accountType, accountClass, currency, openingBalanceMinor).Scan(
		&account.ID,
		&account.UserID,
		&account.Name,
		&account.AccountType,
		&account.AccountClass,
		&account.Currency,
		&account.OpeningBalanceMinor,
		&account.ArchivedAt,
		&account.CreatedAt,
	)
	return account, normalizeWriteError(err)
}

func (s *AccountStore) Update(ctx context.Context, id, userID, name, accountType, accountClass, currency string) (Account, error) {
	var account Account
	if accountType == "" {
		accountType = "cash"
	}
	if accountClass == "" {
		accountClass = "asset"
	}
	if currency == "" {
		currency = "ZMW"
	}
	err := s.db.QueryRow(ctx, `
		update accounts
		set name = $1, account_type = $2, account_class = $3, currency = $4
		where id = $5 and user_id = $6 and archived_at is null
		returning id, user_id, name, account_type, account_class, currency, opening_balance::bigint, archived_at::text, created_at::text
	`, name, accountType, accountClass, currency, id, userID).Scan(
		&account.ID,
		&account.UserID,
		&account.Name,
		&account.AccountType,
		&account.AccountClass,
		&account.Currency,
		&account.OpeningBalanceMinor,
		&account.ArchivedAt,
		&account.CreatedAt,
	)
	return account, normalizeWriteError(err)
}

func (s *AccountStore) Delete(ctx context.Context, id, userID string) error {
	var transactionCount int
	var balanceMinor int64
	if err := s.db.QueryRow(ctx, `
		select
			count(t.id)::int,
			(
					coalesce(a.opening_balance, 0)::bigint
				+ coalesce(sum(
					case
						when t.account_id = a.id then
							case
								when t.entry_kind in ('income_earned', 'income_borrowed', 'investment_income', 'investment_sell', 'bond_principal_redemption') then t.amount::bigint
								when t.entry_kind in ('expense_living', 'expense_interest', 'expense_fee', 'saving_transfer', 'investment_buy', 'investment_loss', 'debt_principal_payment') then -t.amount::bigint
								else 0
							end
						when t.destination_account_id = a.id and t.entry_kind = 'saving_transfer' then t.amount::bigint
						when t.destination_account_id = a.id and t.entry_kind = 'debt_principal_payment' then -t.amount::bigint
						else 0
					end
				), 0)
			) as balance_minor
		from accounts a
		left join transactions t
			on t.user_id = a.user_id
			and t.deleted_at is null
			and t.currency = a.currency
			and (t.account_id = a.id or t.destination_account_id = a.id)
		where a.id = $1
		  and a.user_id = $2
		  and a.archived_at is null
		group by a.id, a.opening_balance
	`, id, userID).Scan(&transactionCount, &balanceMinor); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	if balanceMinor != 0 {
		return ErrAccountHasBalance
	}

	if transactionCount > 0 {
		tag, err := s.db.Exec(ctx, `
			update accounts
			set archived_at = now()
			where id = $1 and user_id = $2 and archived_at is null
		`, id, userID)
		return normalizeExecResult(tag, err)
	}

	tag, err := s.db.Exec(ctx, `
		delete from accounts
		where id = $1 and user_id = $2
	`, id, userID)
	return normalizeExecResult(tag, err)
}
