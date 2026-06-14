package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Account struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	Currency  string `json:"currency"`
	CreatedAt string `json:"createdAt"`
}

type AccountStore struct {
	db *pgxpool.Pool
}

func NewAccountStore(db *pgxpool.Pool) *AccountStore {
	return &AccountStore{db: db}
}

func (s *AccountStore) ListByUser(ctx context.Context, userID string) ([]Account, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, name, currency, created_at
		from accounts
		where user_id = $1
		order by created_at desc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []Account
	for rows.Next() {
		var a Account
		if err := rows.Scan(&a.ID, &a.UserID, &a.Name, &a.Currency, &a.CreatedAt); err != nil {
			return nil, err
		}
		accounts = append(accounts, a)
	}

	return accounts, rows.Err()
}

func (s *AccountStore) Create(ctx context.Context, userID, name, currency string) (Account, error) {
	var account Account
	err := s.db.QueryRow(ctx, `
		insert into accounts (user_id, name, currency)
		values ($1, $2, $3)
		returning id, user_id, name, currency, created_at
	`, userID, name, currency).Scan(
		&account.ID,
		&account.UserID,
		&account.Name,
		&account.Currency,
		&account.CreatedAt,
	)
	return account, err
}

func (s *AccountStore) Update(ctx context.Context, id, userID, name, currency string) (Account, error) {
	var account Account
	err := s.db.QueryRow(ctx, `
		update accounts
		set name = $1, currency = $2
		where id = $3 and user_id = $4
		returning id, user_id, name, currency, created_at
	`, name, currency, id, userID).Scan(
		&account.ID,
		&account.UserID,
		&account.Name,
		&account.Currency,
		&account.CreatedAt,
	)
	return account, err
}

func (s *AccountStore) Delete(ctx context.Context, id, userID string) error {
	_, err := s.db.Exec(ctx, `
		delete from accounts
		where id = $1 and user_id = $2
	`, id, userID)
	return err
}
