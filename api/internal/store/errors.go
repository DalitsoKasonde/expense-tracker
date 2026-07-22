package store

import (
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrNotFound           = errors.New("resource not found")
	ErrConflict           = errors.New("resource conflict")
	ErrAccountHasBalance  = errors.New("account still has balance")
)

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
