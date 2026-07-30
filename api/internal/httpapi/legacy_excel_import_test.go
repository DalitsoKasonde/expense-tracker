package httpapi

import "testing"

func TestNormalizeWorkbookPartPath(t *testing.T) {
	cases := []struct {
		name   string
		target string
		want   string
	}{
		{"relative to xl", "worksheets/sheet1.xml", "xl/worksheets/sheet1.xml"},
		{"absolute from package root", "/xl/worksheets/sheet1.xml", "xl/worksheets/sheet1.xml"},
		{"absolute shared strings", "/xl/sharedStrings.xml", "xl/sharedStrings.xml"},
		{"relative shared strings", "sharedStrings.xml", "xl/sharedStrings.xml"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeWorkbookPartPath(tc.target); got != tc.want {
				t.Fatalf("normalizeWorkbookPartPath(%q) = %q, want %q", tc.target, got, tc.want)
			}
		})
	}
}

func TestMonthIndexFromName(t *testing.T) {
	cases := map[string]int{
		"JANUARY": 1, "Jan": 1, "FEB": 2, "MARCH": 3, "APRIL": 4,
		"MAY": 5, "JUNE": 6, "JULY": 7, "AUGUST": 8, "SEPT": 9,
		"September": 9, "OCT": 10, "NOV": 11, "DEC": 12,
		"TOTAL": 0, "": 0, "OTHER": 0,
	}
	for in, want := range cases {
		if got := monthIndexFromName(in); got != want {
			t.Errorf("monthIndexFromName(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestOverallRowMonths(t *testing.T) {
	// Header maps column C (3) to February, so B (2) is January and the trailing
	// total column N (14) is month 13 and must be dropped.
	firstColNum, firstMonth := 2, 1 // B -> January
	values := map[string]string{
		"A": "GROCERIES",
		"B": "100.00",
		"C": "0",
		"D": "50.50",
		"N": "150.50", // yearly total, must be ignored
	}
	got := overallRowMonths(values, firstColNum, firstMonth)
	if len(got) != 2 {
		t.Fatalf("expected 2 month amounts, got %d: %+v", len(got), got)
	}
	if got[0].month != 1 || got[0].amount != 10000 {
		t.Errorf("first = %+v, want {month:1 amount:10000}", got[0])
	}
	if got[1].month != 3 || got[1].amount != 5050 {
		t.Errorf("second = %+v, want {month:3 amount:5050}", got[1])
	}
}
