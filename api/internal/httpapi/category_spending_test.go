package httpapi

import (
	"testing"

	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

func categoryFixture(id, name string, parentID *string) store.Category {
	return store.Category{ID: id, Name: name, CategoryGroup: "expense", ParentID: parentID}
}

func stringPtr(value string) *string {
	return &value
}

func TestBuildCategorySpendingTreeRollsChildrenIntoParents(t *testing.T) {
	t.Parallel()

	categories := []store.Category{
		categoryFixture("housing", "Housing", nil),
		categoryFixture("rent", "Rent", stringPtr("housing")),
		categoryFixture("power", "Power", stringPtr("housing")),
		categoryFixture("food", "Food", nil),
	}
	buckets := []store.CategorySpendingBucket{
		{CategoryID: "housing", Month: 1, Amount: 1_000},
		{CategoryID: "rent", Month: 1, Amount: 50_000},
		{CategoryID: "rent", Month: 2, Amount: 50_000},
		{CategoryID: "power", Month: 2, Amount: 9_000},
		{CategoryID: "food", Month: 1, Amount: 30_000},
	}

	nodes, months, total := buildCategorySpendingTree(categories, buckets)

	if total != 140_000 {
		t.Fatalf("total = %d, want 140000", total)
	}
	if months[0] != 81_000 || months[1] != 59_000 {
		t.Fatalf("months[0..1] = %d, %d, want 81000, 59000", months[0], months[1])
	}
	if len(nodes) != 2 {
		t.Fatalf("len(nodes) = %d, want 2", len(nodes))
	}
	// Housing (110_000) outranks Food (30_000) even though its own direct
	// spending is only 1_000.
	if nodes[0].ID != "housing" || nodes[0].Total != 110_000 || nodes[0].Direct != 1_000 {
		t.Fatalf("nodes[0] = %#v", nodes[0])
	}
	if nodes[0].Months[1] != 59_000 {
		t.Fatalf("housing February = %d, want 59000", nodes[0].Months[1])
	}
	if len(nodes[0].Children) != 2 || nodes[0].Children[0].ID != "rent" {
		t.Fatalf("housing children = %#v", nodes[0].Children)
	}
	if nodes[0].Children[0].ParentID == nil || *nodes[0].Children[0].ParentID != "housing" {
		t.Fatalf("rent parentId = %v", nodes[0].Children[0].ParentID)
	}
}

func TestBuildCategorySpendingTreeDropsCategoriesWithoutSpending(t *testing.T) {
	t.Parallel()

	categories := []store.Category{
		categoryFixture("food", "Food", nil),
		categoryFixture("travel", "Travel", nil),
		categoryFixture("flights", "Flights", stringPtr("travel")),
	}
	buckets := []store.CategorySpendingBucket{{CategoryID: "food", Month: 3, Amount: 7_000}}

	nodes, _, total := buildCategorySpendingTree(categories, buckets)

	if total != 7_000 {
		t.Fatalf("total = %d, want 7000", total)
	}
	if len(nodes) != 1 || nodes[0].ID != "food" {
		t.Fatalf("nodes = %#v, want only food", nodes)
	}
}

func TestBuildCategorySpendingTreeBucketsUnknownAndMissingCategoriesLast(t *testing.T) {
	t.Parallel()

	categories := []store.Category{categoryFixture("food", "Food", nil)}
	buckets := []store.CategorySpendingBucket{
		{CategoryID: "", Month: 1, Amount: 4_000},
		{CategoryID: "deleted-category", Month: 2, Amount: 1_000},
		{CategoryID: "food", Month: 1, Amount: 100},
	}

	nodes, _, total := buildCategorySpendingTree(categories, buckets)

	if total != 5_100 {
		t.Fatalf("total = %d, want 5100", total)
	}
	if len(nodes) != 2 {
		t.Fatalf("len(nodes) = %d, want 2", len(nodes))
	}
	// Uncategorized is larger than Food but still sorts last: it is a data gap,
	// not a category competing for the top of the list.
	last := nodes[len(nodes)-1]
	if last.ID != uncategorizedCategoryID || last.Total != 5_000 {
		t.Fatalf("last node = %#v, want uncategorized totalling 5000", last)
	}
}

func TestBuildCategorySpendingTreeSurvivesParentCycle(t *testing.T) {
	t.Parallel()

	categories := []store.Category{
		categoryFixture("a", "A", stringPtr("b")),
		categoryFixture("b", "B", stringPtr("a")),
		categoryFixture("food", "Food", nil),
	}
	buckets := []store.CategorySpendingBucket{
		{CategoryID: "a", Month: 1, Amount: 500},
		{CategoryID: "food", Month: 1, Amount: 500},
	}

	nodes, _, total := buildCategorySpendingTree(categories, buckets)

	// The cycle has no root, so neither of its members is reachable; the rest of
	// the tree still reports.
	if total != 500 {
		t.Fatalf("total = %d, want 500", total)
	}
	if len(nodes) != 1 || nodes[0].ID != "food" {
		t.Fatalf("nodes = %#v, want only food", nodes)
	}
}

func TestBuildCategorySpendingTreeHandlesEmptyInput(t *testing.T) {
	t.Parallel()

	nodes, months, total := buildCategorySpendingTree(nil, nil)

	if total != 0 || len(nodes) != 0 {
		t.Fatalf("nodes = %#v, total = %d, want empty", nodes, total)
	}
	if len(months) != 12 {
		t.Fatalf("len(months) = %d, want 12", len(months))
	}
}
