package httpapi

import (
	"encoding/csv"
	"strings"
	"testing"
)

func TestStatementCSVWritesMajorUnitsForSpreadsheets(t *testing.T) {
	months := []monthlyInsight{
		{MonthLabel: "Jan", EarnedIncome: 1_250_75, LivingExpenses: 400_00, FreeCashFlow: -99},
	}

	raw, err := buildStatementCSV(months, "ZMW")
	if err != nil {
		t.Fatalf("buildStatementCSV returned an error: %v", err)
	}

	records, err := csv.NewReader(strings.NewReader(string(raw))).ReadAll()
	if err != nil {
		t.Fatalf("statement is not valid CSV: %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("got %d rows, want a header and one month", len(records))
	}
	if records[0][0] != "Month" || records[0][1] != "Currency" {
		t.Fatalf("header = %v", records[0])
	}

	row := records[1]
	if row[2] != "1250.75" {
		t.Errorf("earned income = %q, want major units with two decimals", row[2])
	}
	// A negative amount rendered as "-0.-99" or "0.-99" is the classic way
	// integer division on a signed minor amount goes wrong.
	if row[9] != "-0.99" {
		t.Errorf("free cash flow = %q, want -0.99", row[9])
	}
}

func TestStatementCSVCoversEveryMonthGiven(t *testing.T) {
	months := make([]monthlyInsight, 12)
	for i := range months {
		months[i].MonthLabel = "M"
	}

	raw, err := buildStatementCSV(months, "ZMW")
	if err != nil {
		t.Fatalf("buildStatementCSV returned an error: %v", err)
	}

	records, err := csv.NewReader(strings.NewReader(string(raw))).ReadAll()
	if err != nil {
		t.Fatalf("statement is not valid CSV: %v", err)
	}
	if len(records) != 13 {
		t.Fatalf("got %d rows, want a header and twelve months", len(records))
	}
}

func TestSumMonthsAddsUpTheYear(t *testing.T) {
	total := sumMonths([]monthlyInsight{
		{EarnedIncome: 100_00, LivingExpenses: 40_00, FreeCashFlow: 60_00},
		{EarnedIncome: 200_00, LivingExpenses: 50_00, FreeCashFlow: -10_00},
	})

	if total.EarnedIncome != 300_00 {
		t.Errorf("earned income = %d", total.EarnedIncome)
	}
	if total.FreeCashFlow != 50_00 {
		t.Errorf("free cash flow = %d", total.FreeCashFlow)
	}
}

func TestMinorToDecimalKeepsSmallNegativeAmountsReadable(t *testing.T) {
	cases := map[int64]string{
		0:       "0.00",
		5:       "0.05",
		-5:      "-0.05",
		-1_00:   "-1.00",
		123_456: "1234.56",
	}

	for amount, want := range cases {
		if got := minorToDecimal(amount); got != want {
			t.Errorf("minorToDecimal(%d) = %q, want %q", amount, got, want)
		}
	}
}
