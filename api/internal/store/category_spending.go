package store

import (
	"context"
	"fmt"
	"time"
)

// CategorySpendingBucket is one category's spending in one month of a year.
// CategoryID is empty when the transaction carries no category.
type CategorySpendingBucket struct {
	CategoryID string
	Month      int
	Amount     int64
}

// SpendingByCategory totals living expenses per category per month for a year.
//
// Scoped to entry_kind = 'expense_living' so the totals reconcile with the
// "Living expenses" row of the annual report. Debt payments, interest, savings,
// and investment purchases are separate rows there and are excluded here.
func (s *CategoryStore) SpendingByCategory(ctx context.Context, userID, currency string, year int) ([]CategorySpendingBucket, error) {
	start := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	end := time.Date(year+1, 1, 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")

	rows, err := s.db.Query(ctx, `
		select
			coalesce(category_id::text, '') as category_id,
			extract(month from transaction_date)::int as month,
			coalesce(sum(amount), 0)::bigint as amount
		from transactions
		where user_id = $1
		  and currency = $2
		  and deleted_at is null
		  and entry_kind = 'expense_living'
		  and transaction_date >= $3
		  and transaction_date < $4
		group by 1, 2
	`, userID, currency, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	buckets := make([]CategorySpendingBucket, 0)
	for rows.Next() {
		var bucket CategorySpendingBucket
		if err := rows.Scan(&bucket.CategoryID, &bucket.Month, &bucket.Amount); err != nil {
			return nil, err
		}
		if bucket.Month < 1 || bucket.Month > 12 {
			return nil, fmt.Errorf("category spending: month %d out of range", bucket.Month)
		}
		buckets = append(buckets, bucket)
	}

	return buckets, rows.Err()
}
