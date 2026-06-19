package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SavingsGroup struct {
	ID                string `json:"id"`
	UserID            string `json:"userId"`
	AccountID         string `json:"accountId"`
	Name              string `json:"name"`
	IsShareoutGroup   bool   `json:"isShareoutGroup"`
	CycleStart        string `json:"cycleStart"`
	CycleLengthMonths int    `json:"cycleLengthMonths"`
	Status            string `json:"status"`
	TargetMinor       *int64 `json:"targetMinor"`
	ContributedMinor  int64  `json:"contributedMinor"`
	CurrentBalance    int64  `json:"currentBalance"`
	CreatedAt         string `json:"createdAt"`
}

type CreateSavingsGroupInput struct {
	Name              string `json:"name"`
	IsShareoutGroup   bool   `json:"isShareoutGroup"`
	CycleStart        string `json:"cycleStart"`
	CycleLengthMonths int    `json:"cycleLengthMonths"`
	TargetMinor       *int64 `json:"targetMinor"`
	Currency          string `json:"currency"`
}

type CloseSavingsGroupInput struct {
	GroupID       string `json:"groupId"`
	CashAccountID string `json:"cashAccountId"`
	PayoutMinor   int64  `json:"payoutMinor"`
	CycleEnd      string `json:"cycleEnd"`
	Note          string `json:"note"`
	Currency      string `json:"currency"`
}

type SavingsGroupCloseResult struct {
	OriginEventID       string        `json:"originEventId"`
	ContributedMinor    int64         `json:"contributedMinor"`
	PayoutMinor         int64         `json:"payoutMinor"`
	RealizedResultMinor int64         `json:"realizedResultMinor"`
	Transactions        []Transaction `json:"transactions"`
	Group               SavingsGroup  `json:"group"`
}

type SavingsGroupStore struct {
	db *pgxpool.Pool
}

func NewSavingsGroupStore(db *pgxpool.Pool) *SavingsGroupStore {
	return &SavingsGroupStore{db: db}
}

func (s *SavingsGroupStore) ListByUser(ctx context.Context, userID string) ([]SavingsGroup, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, account_id, name, is_shareout_group, cycle_start::text,
		       cycle_length_months, status, target_minor, created_at::text
		from savings_groups
		where user_id = $1
		order by status asc, name asc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	groups := make([]SavingsGroup, 0)
	for rows.Next() {
		var group SavingsGroup
		if err := rows.Scan(
			&group.ID,
			&group.UserID,
			&group.AccountID,
			&group.Name,
			&group.IsShareoutGroup,
			&group.CycleStart,
			&group.CycleLengthMonths,
			&group.Status,
			&group.TargetMinor,
			&group.CreatedAt,
		); err != nil {
			return nil, err
		}
		if err := s.decorate(ctx, &group); err != nil {
			return nil, err
		}
		groups = append(groups, group)
	}
	return groups, rows.Err()
}

func (s *SavingsGroupStore) Create(ctx context.Context, userID string, input CreateSavingsGroupInput) (SavingsGroup, error) {
	if input.Name == "" {
		return SavingsGroup{}, errors.New("name is required")
	}
	if input.Currency == "" {
		input.Currency = "ZMW"
	}
	if input.CycleLengthMonths == 0 {
		input.CycleLengthMonths = 12
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return SavingsGroup{}, err
	}
	defer tx.Rollback(ctx)

	var accountID string
	if err := tx.QueryRow(ctx, `
		insert into accounts (user_id, name, account_type, account_class, currency)
		values ($1, $2, 'savings', 'asset', $3)
		returning id
	`, userID, input.Name, input.Currency).Scan(&accountID); err != nil {
		return SavingsGroup{}, normalizeWriteError(err)
	}

	cycleStart := input.CycleStart
	var group SavingsGroup
	err = tx.QueryRow(ctx, `
		insert into savings_groups (
			user_id, account_id, name, is_shareout_group, cycle_start, cycle_length_months, target_minor
		)
		values ($1, $2, $3, $4, coalesce(nullif($5, '')::date, current_date), $6, $7)
		returning id, user_id, account_id, name, is_shareout_group, cycle_start::text,
		          cycle_length_months, status, target_minor, created_at::text
	`, userID, accountID, input.Name, input.IsShareoutGroup, cycleStart, input.CycleLengthMonths, input.TargetMinor).Scan(
		&group.ID,
		&group.UserID,
		&group.AccountID,
		&group.Name,
		&group.IsShareoutGroup,
		&group.CycleStart,
		&group.CycleLengthMonths,
		&group.Status,
		&group.TargetMinor,
		&group.CreatedAt,
	)
	if err != nil {
		return SavingsGroup{}, normalizeWriteError(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return SavingsGroup{}, err
	}
	if err := s.decorate(ctx, &group); err != nil {
		return SavingsGroup{}, err
	}
	return group, nil
}

func (s *SavingsGroupStore) CloseCycle(ctx context.Context, userID string, input CloseSavingsGroupInput) (SavingsGroupCloseResult, error) {
	if input.PayoutMinor < 0 {
		return SavingsGroupCloseResult{}, errors.New("payout cannot be negative")
	}
	if input.Currency == "" {
		input.Currency = "ZMW"
	}

	group, err := s.get(ctx, userID, input.GroupID)
	if err != nil {
		return SavingsGroupCloseResult{}, err
	}
	contributed, err := s.contributedSince(ctx, userID, group.AccountID, group.CycleStart)
	if err != nil {
		return SavingsGroupCloseResult{}, err
	}
	resultMinor := input.PayoutMinor - contributed

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return SavingsGroupCloseResult{}, err
	}
	defer tx.Rollback(ctx)

	var originEventID string
	if err := tx.QueryRow(ctx, `select gen_random_uuid()::text`).Scan(&originEventID); err != nil {
		return SavingsGroupCloseResult{}, err
	}
	originType := "savings_group_shareout"
	note := input.Note
	if note == "" {
		note = "Savings group share-out"
	}

	created := make([]Transaction, 0, 2)
	if contributed > 0 {
		dest := input.CashAccountID
		returnNote := note + " - return of contributions"
		item, err := insertLoanTransaction(ctx, tx, Transaction{
			UserID:               userID,
			TransactionDate:      input.CycleEnd,
			EntryKind:            "saving_transfer",
			Amount:               contributed,
			Currency:             input.Currency,
			AccountID:            group.AccountID,
			DestinationAccountID: &dest,
			Note:                 &returnNote,
			Source:               "manual",
			OriginEventID:        &originEventID,
			OriginEventType:      &originType,
		})
		if err != nil {
			return SavingsGroupCloseResult{}, err
		}
		created = append(created, item)
	}

	if resultMinor != 0 {
		entryKind := "investment_income"
		amount := resultMinor
		resultNote := note + " - realized gain"
		if resultMinor < 0 {
			entryKind = "investment_loss"
			amount = -resultMinor
			resultNote = note + " - realized loss"
		}
		item, err := insertLoanTransaction(ctx, tx, Transaction{
			UserID:          userID,
			TransactionDate: input.CycleEnd,
			EntryKind:       entryKind,
			Amount:          amount,
			Currency:        input.Currency,
			AccountID:       input.CashAccountID,
			Note:            &resultNote,
			Source:          "manual",
			OriginEventID:   &originEventID,
			OriginEventType: &originType,
		})
		if err != nil {
			return SavingsGroupCloseResult{}, err
		}
		created = append(created, item)
	}

	if _, err := tx.Exec(ctx, `
		insert into savings_group_cycles (
			group_id, cycle_start, cycle_end, contributed_minor, payout_minor, realized_result_minor, origin_event_id
		)
		values ($1, $2, $3, $4, $5, $6, $7)
	`, group.ID, group.CycleStart, input.CycleEnd, contributed, input.PayoutMinor, resultMinor, originEventID); err != nil {
		return SavingsGroupCloseResult{}, err
	}

	if _, err := tx.Exec(ctx, `
		update savings_groups
		set cycle_start = ($1::date + interval '1 day')::date, updated_at = now()
		where id = $2 and user_id = $3
	`, input.CycleEnd, group.ID, userID); err != nil {
		return SavingsGroupCloseResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return SavingsGroupCloseResult{}, err
	}

	updated, err := s.get(ctx, userID, group.ID)
	if err != nil {
		return SavingsGroupCloseResult{}, err
	}
	if err := s.decorate(ctx, &updated); err != nil {
		return SavingsGroupCloseResult{}, err
	}

	return SavingsGroupCloseResult{
		OriginEventID:       originEventID,
		ContributedMinor:    contributed,
		PayoutMinor:         input.PayoutMinor,
		RealizedResultMinor: resultMinor,
		Transactions:        created,
		Group:               updated,
	}, nil
}

func (s *SavingsGroupStore) get(ctx context.Context, userID, groupID string) (SavingsGroup, error) {
	var group SavingsGroup
	err := s.db.QueryRow(ctx, `
		select id, user_id, account_id, name, is_shareout_group, cycle_start::text,
		       cycle_length_months, status, target_minor, created_at::text
		from savings_groups
		where id = $1 and user_id = $2
	`, groupID, userID).Scan(
		&group.ID,
		&group.UserID,
		&group.AccountID,
		&group.Name,
		&group.IsShareoutGroup,
		&group.CycleStart,
		&group.CycleLengthMonths,
		&group.Status,
		&group.TargetMinor,
		&group.CreatedAt,
	)
	return group, normalizeWriteError(err)
}

func (s *SavingsGroupStore) decorate(ctx context.Context, group *SavingsGroup) error {
	contributed, err := s.contributedSince(ctx, group.UserID, group.AccountID, group.CycleStart)
	if err != nil {
		return err
	}
	group.ContributedMinor = contributed
	return s.db.QueryRow(ctx, `
		select (
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
					else 0
				end
			), 0)
		)::bigint
		from accounts a
		left join transactions t
			on t.user_id = a.user_id
			and t.deleted_at is null
			and t.currency = a.currency
			and (t.account_id = a.id or t.destination_account_id = a.id)
		where a.id = $1 and a.user_id = $2
		group by a.id, a.opening_balance
	`, group.AccountID, group.UserID).Scan(&group.CurrentBalance)
}

func (s *SavingsGroupStore) contributedSince(ctx context.Context, userID, accountID, start string) (int64, error) {
	var contributed int64
	err := s.db.QueryRow(ctx, `
		select coalesce(sum(amount), 0)::bigint
		from transactions
		where user_id = $1
		  and destination_account_id = $2
		  and entry_kind = 'saving_transfer'
		  and deleted_at is null
		  and transaction_date >= $3
	`, userID, accountID, start).Scan(&contributed)
	return contributed, err
}
