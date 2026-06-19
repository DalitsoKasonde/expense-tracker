package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Account struct {
	ID           string  `json:"id"`
	UserID       string  `json:"userId"`
	Name         string  `json:"name"`
	AccountType  string  `json:"accountType"`
	AccountClass string  `json:"accountClass"`
	Currency     string  `json:"currency"`
	ArchivedAt   *string `json:"archivedAt"`
	CreatedAt    string  `json:"createdAt"`
}

type AccountStore struct {
	db *pgxpool.Pool
}

func NewAccountStore(db *pgxpool.Pool) *AccountStore {
	return &AccountStore{db: db}
}

func (s *AccountStore) ListByUser(ctx context.Context, userID string) ([]Account, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, name, account_type, account_class, currency, archived_at::text, created_at::text
		from accounts
		where user_id = $1 and archived_at is null
		order by created_at desc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []Account
	for rows.Next() {
		var a Account
		if err := rows.Scan(&a.ID, &a.UserID, &a.Name, &a.AccountType, &a.AccountClass, &a.Currency, &a.ArchivedAt, &a.CreatedAt); err != nil {
			return nil, err
		}
		accounts = append(accounts, a)
	}

	return accounts, rows.Err()
}

func (s *AccountStore) Create(ctx context.Context, userID, name, accountType, accountClass, currency string) (Account, error) {
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
		insert into accounts (user_id, name, account_type, account_class, currency)
		values ($1, $2, $3, $4, $5)
		returning id, user_id, name, account_type, account_class, currency, archived_at::text, created_at::text
	`, userID, name, accountType, accountClass, currency).Scan(
		&account.ID,
		&account.UserID,
		&account.Name,
		&account.AccountType,
		&account.AccountClass,
		&account.Currency,
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
		returning id, user_id, name, account_type, account_class, currency, archived_at::text, created_at::text
	`, name, accountType, accountClass, currency, id, userID).Scan(
		&account.ID,
		&account.UserID,
		&account.Name,
		&account.AccountType,
		&account.AccountClass,
		&account.Currency,
		&account.ArchivedAt,
		&account.CreatedAt,
	)
	return account, normalizeWriteError(err)
}

func (s *AccountStore) Delete(ctx context.Context, id, userID string) error {
	var transactionCount int
	if err := s.db.QueryRow(ctx, `
		select count(*)
		from transactions
		where user_id = $1
		  and deleted_at is null
		  and (account_id = $2 or destination_account_id = $2)
	`, userID, id).Scan(&transactionCount); err != nil {
		return err
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
