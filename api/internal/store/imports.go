package store

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Import struct {
	ID     string      `json:"id"`
	UserID string      `json:"userId"`
	Status string      `json:"status"` // uploaded, parsed, needs_mapping, ready_to_confirm, confirmed, failed, undone
	Error  *string     `json:"error"`
	Rows   []ImportRow `json:"rows,omitempty"`
	//Mappings store how user mapped columns
	Mappings *json.RawMessage `json:"mappings"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type ImportRow struct {
	ID        string           `json:"id"`
	ImportID  string           `json:"importId"`
	RawData   json.RawMessage  `json:"rawData"`
	Mapped    *json.RawMessage `json:"mapped"`
	Error     *string          `json:"error"`
	CreatedAt string           `json:"createdAt"`
}

type ImportStore struct {
	db *pgxpool.Pool
}

func NewImportStore(db *pgxpool.Pool) *ImportStore {
	return &ImportStore{db: db}
}

func (s *ImportStore) Create(ctx context.Context, userID string) (Import, error) {
	var imp Import
	err := s.db.QueryRow(ctx, `
		insert into imports (user_id, status)
		values ($1, 'uploaded')
		returning id, user_id, status, error, mappings, created_at, updated_at
	`, userID).Scan(
		&imp.ID, &imp.UserID, &imp.Status, &imp.Error, &imp.Mappings, &imp.CreatedAt, &imp.UpdatedAt,
	)
	return imp, err
}

func (s *ImportStore) GetByID(ctx context.Context, id, userID string) (Import, error) {
	var imp Import
	err := s.db.QueryRow(ctx, `
		select id, user_id, status, error, mappings, created_at, updated_at
		from imports
		where id = $1 and user_id = $2
	`, id, userID).Scan(
		&imp.ID, &imp.UserID, &imp.Status, &imp.Error, &imp.Mappings, &imp.CreatedAt, &imp.UpdatedAt,
	)
	return imp, err
}

func (s *ImportStore) UpdateStatus(ctx context.Context, id, userID, status string, errMsg *string) error {
	_, err := s.db.Exec(ctx, `
		update imports
		set status = $1, error = $2, updated_at = now()
		where id = $3 and user_id = $4
	`, status, errMsg, id, userID)
	return err
}

func (s *ImportStore) UpdateMappings(ctx context.Context, id, userID string, mappings json.RawMessage) error {
	_, err := s.db.Exec(ctx, `
		update imports
		set mappings = $1, updated_at = now()
		where id = $2 and user_id = $3
	`, mappings, id, userID)
	return err
}

func (s *ImportStore) ListByUser(ctx context.Context, userID string) ([]Import, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, status, error, mappings, created_at, updated_at
		from imports
		where user_id = $1
		order by created_at desc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var imports []Import
	for rows.Next() {
		var imp Import
		if err := rows.Scan(
			&imp.ID, &imp.UserID, &imp.Status, &imp.Error, &imp.Mappings, &imp.CreatedAt, &imp.UpdatedAt,
		); err != nil {
			return nil, err
		}
		imports = append(imports, imp)
	}

	return imports, rows.Err()
}

func (s *ImportStore) CreateRow(ctx context.Context, importID string, rawData json.RawMessage) (ImportRow, error) {
	var row ImportRow
	err := s.db.QueryRow(ctx, `
		insert into import_rows (import_id, raw_data)
		values ($1, $2)
		returning id, import_id, raw_data, mapped, error, created_at
	`, importID, rawData).Scan(
		&row.ID, &row.ImportID, &row.RawData, &row.Mapped, &row.Error, &row.CreatedAt,
	)
	return row, err
}

func (s *ImportStore) GetRows(ctx context.Context, importID string) ([]ImportRow, error) {
	rows, err := s.db.Query(ctx, `
		select id, import_id, raw_data, mapped, error, created_at
		from import_rows
		where import_id = $1
		order by created_at asc
	`, importID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var importRows []ImportRow
	for rows.Next() {
		var row ImportRow
		if err := rows.Scan(
			&row.ID, &row.ImportID, &row.RawData, &row.Mapped, &row.Error, &row.CreatedAt,
		); err != nil {
			return nil, err
		}
		importRows = append(importRows, row)
	}

	return importRows, rows.Err()
}

func (s *ImportStore) UpdateRowMapped(ctx context.Context, rowID string, mapped json.RawMessage, errMsg *string) error {
	_, err := s.db.Exec(ctx, `
		update import_rows
		set mapped = $1, error = $2
		where id = $3
	`, mapped, errMsg, rowID)
	return err
}

func (s *ImportStore) GetRowsByImportID(ctx context.Context, importID string, limit, offset int) ([]ImportRow, error) {
	rows, err := s.db.Query(ctx, `
		select id, import_id, raw_data, mapped, error, created_at
		from import_rows
		where import_id = $1
		order by created_at asc
		limit $2 offset $3
	`, importID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var importRows []ImportRow
	for rows.Next() {
		var row ImportRow
		if err := rows.Scan(
			&row.ID, &row.ImportID, &row.RawData, &row.Mapped, &row.Error, &row.CreatedAt,
		); err != nil {
			return nil, err
		}
		importRows = append(importRows, row)
	}

	return importRows, rows.Err()
}
