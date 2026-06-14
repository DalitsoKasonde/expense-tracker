package migrations

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Run(ctx context.Context, db *pgxpool.Pool, direction, dir string) error {
	if direction != "up" && direction != "down" {
		return errors.New("direction must be up or down")
	}

	if _, err := db.Exec(ctx, `
		create table if not exists schema_migrations (
			name text primary key,
			applied_at timestamptz not null default now()
		)
	`); err != nil {
		return err
	}

	files, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	migrations := make([]string, 0)
	suffix := "." + direction + ".sql"

	for _, file := range files {
		if file.IsDir() {
			continue
		}

		if strings.HasSuffix(file.Name(), suffix) {
			migrations = append(migrations, file.Name())
		}
	}

	sort.Strings(migrations)
	if direction == "down" {
		sort.Sort(sort.Reverse(sort.StringSlice(migrations)))
	}

	for _, name := range migrations {
		path := filepath.Join(dir, name)
		sqlBytes, err := os.ReadFile(path)
		if err != nil {
			return err
		}

		tx, err := db.Begin(ctx)
		if err != nil {
			return err
		}

		baseName := strings.TrimSuffix(strings.TrimSuffix(name, ".sql"), "."+direction)

		if direction == "up" {
			var exists bool
			if err := tx.QueryRow(ctx, `select exists(select 1 from schema_migrations where name = $1)`, baseName).Scan(&exists); err != nil {
				_ = tx.Rollback(ctx)
				return err
			}
			if exists {
				_ = tx.Rollback(ctx)
				continue
			}
		}

		if _, err := tx.Exec(ctx, string(sqlBytes)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("%s failed: %w", name, err)
		}

		if direction == "up" {
			if _, err := tx.Exec(ctx, `insert into schema_migrations (name) values ($1)`, baseName); err != nil {
				_ = tx.Rollback(ctx)
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `delete from schema_migrations where name = $1`, baseName); err != nil {
				_ = tx.Rollback(ctx)
				return err
			}
		}

		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}

	return nil
}

