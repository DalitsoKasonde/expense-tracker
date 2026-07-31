package httpapi

import (
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

// uncategorizedCategoryID is the node id used for spending with no category, and
// for spending pointing at a category that no longer exists.
const uncategorizedCategoryID = "uncategorized"

type categorySpendingNode struct {
	ID string `json:"id"`
	// ParentID is null for top-level categories.
	ParentID *string `json:"parentId"`
	Name     string  `json:"name"`
	// Total is this category plus every descendant; Direct excludes descendants.
	Total    int64                  `json:"total"`
	Direct   int64                  `json:"direct"`
	Months   []int64                `json:"months"`
	Children []categorySpendingNode `json:"children"`
}

type categorySpendingResponse struct {
	Year       int                    `json:"year"`
	Currency   string                 `json:"currency"`
	Total      int64                  `json:"total"`
	Months     []int64                `json:"months"`
	Categories []categorySpendingNode `json:"categories"`
}

func (s *Server) categorySpending(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	year := time.Now().Year()
	if raw := r.URL.Query().Get("year"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 2000 || parsed > 2100 {
			http.Error(w, "year is invalid", http.StatusBadRequest)
			return
		}
		year = parsed
	}
	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "ZMW"
	}

	categories, err := s.categories.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		writeInternalError(w, r, "category_spending.categories", "spending by category is temporarily unavailable", err)
		return
	}
	buckets, err := s.categories.SpendingByCategory(r.Context(), claims.UserID, currency, year)
	if err != nil {
		writeInternalError(w, r, "category_spending.totals", "spending by category is temporarily unavailable", err)
		return
	}

	nodes, months, total := buildCategorySpendingTree(categories, buckets)

	writeJSON(w, http.StatusOK, categorySpendingResponse{
		Year:       year,
		Currency:   currency,
		Total:      total,
		Months:     months,
		Categories: nodes,
	})
}

// buildCategorySpendingTree rolls monthly buckets up the category tree.
//
// Categories with no spending anywhere in their subtree are dropped: the tree in
// settings is a template and is usually much larger than the part of it a given
// year actually touched.
func buildCategorySpendingTree(
	categories []store.Category,
	buckets []store.CategorySpendingBucket,
) ([]categorySpendingNode, []int64, int64) {
	known := make(map[string]store.Category, len(categories))
	for _, category := range categories {
		known[category.ID] = category
	}

	directMonths := make(map[string][]int64)
	addMonths := func(id string, month int, amount int64) {
		months, ok := directMonths[id]
		if !ok {
			months = make([]int64, 12)
			directMonths[id] = months
		}
		months[month-1] += amount
	}
	for _, bucket := range buckets {
		if bucket.Month < 1 || bucket.Month > 12 {
			continue
		}
		id := bucket.CategoryID
		// A category deleted after the fact nulls the transaction's category_id,
		// but an id we cannot name is still unusable as a label.
		if _, ok := known[id]; !ok {
			id = uncategorizedCategoryID
		}
		addMonths(id, bucket.Month, bucket.Amount)
	}

	childrenOf := make(map[string][]store.Category)
	roots := make([]store.Category, 0, len(categories))
	for _, category := range categories {
		if category.ParentID != nil && *category.ParentID != "" {
			if _, ok := known[*category.ParentID]; ok {
				childrenOf[*category.ParentID] = append(childrenOf[*category.ParentID], category)
				continue
			}
		}
		roots = append(roots, category)
	}

	// The parent chain is validated on write, but a cycle here would recurse
	// forever, so the path guard is not optional.
	onPath := make(map[string]bool, len(categories))
	var build func(category store.Category) (categorySpendingNode, bool)
	build = func(category store.Category) (categorySpendingNode, bool) {
		if onPath[category.ID] {
			return categorySpendingNode{}, false
		}
		onPath[category.ID] = true
		defer delete(onPath, category.ID)

		node := categorySpendingNode{
			ID:       category.ID,
			ParentID: category.ParentID,
			Name:     category.Name,
			Months:   make([]int64, 12),
			Children: make([]categorySpendingNode, 0),
		}
		if months, ok := directMonths[category.ID]; ok {
			copy(node.Months, months)
			for _, amount := range months {
				node.Direct += amount
			}
		}
		node.Total = node.Direct

		for _, child := range childrenOf[category.ID] {
			childNode, ok := build(child)
			if !ok {
				continue
			}
			node.Children = append(node.Children, childNode)
			node.Total += childNode.Total
			for index, amount := range childNode.Months {
				node.Months[index] += amount
			}
		}
		sortCategorySpendingNodes(node.Children)

		return node, node.Total != 0
	}

	nodes := make([]categorySpendingNode, 0, len(roots))
	for _, root := range roots {
		node, ok := build(root)
		if !ok {
			continue
		}
		nodes = append(nodes, node)
	}
	sortCategorySpendingNodes(nodes)

	if months, ok := directMonths[uncategorizedCategoryID]; ok {
		node := categorySpendingNode{
			ID:       uncategorizedCategoryID,
			Name:     "Uncategorized",
			Months:   make([]int64, 12),
			Children: make([]categorySpendingNode, 0),
		}
		copy(node.Months, months)
		for _, amount := range months {
			node.Direct += amount
		}
		node.Total = node.Direct
		if node.Total != 0 {
			// Always last: it is a gap in the data, not a category that competes
			// with the others for the top of the list.
			nodes = append(nodes, node)
		}
	}

	totalMonths := make([]int64, 12)
	total := int64(0)
	for _, node := range nodes {
		for index, amount := range node.Months {
			totalMonths[index] += amount
		}
		total += node.Total
	}

	return nodes, totalMonths, total
}

func sortCategorySpendingNodes(nodes []categorySpendingNode) {
	sort.SliceStable(nodes, func(first, second int) bool {
		if nodes[first].Total != nodes[second].Total {
			return nodes[first].Total > nodes[second].Total
		}
		return nodes[first].Name < nodes[second].Name
	})
}
