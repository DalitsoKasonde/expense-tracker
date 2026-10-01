package store

import (
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrNotFound               = errors.New("resource not found")
	ErrConflict               = errors.New("resource conflict")
	ErrAccountHasBalance      = errors.New("account still has balance")
	ErrAccountHasTransactions = errors.New("account already has transactions")
	ErrAccountCurrencyLocked  = errors.New("account currency cannot change once it has transactions")
	ErrAssetHasActivity       = errors.New("asset has activity beyond purchases")
)

// ValidationError is input the person can fix, with a message written for
// them. Handlers show it as is; anything else is an internal failure whose
// text must not reach the screen.
type ValidationError struct{ message string }

func (e ValidationError) Error() string { return e.message }

func invalid(format string, args ...any) error {
	return ValidationError{message: fmt.Sprintf(format, args...)}
}

func normalizeWriteError(err error) error {
	if err == nil {
		return nil
	}

	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrConflict
	}

	return err
}

func normalizeExecResult(tag pgconn.CommandTag, err error) error {
	if err != nil {
		return normalizeWriteError(err)
	}

	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}
