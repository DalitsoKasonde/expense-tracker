package httpapi

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

var legacyWorkbookYearPattern = regexp.MustCompile(`(?:19|20)\d{2}`)

var monthNames = []string{
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
}

type legacyWorkbookEntry struct {
	Raw    legacyImportRawRow
	Mapped legacyMappedTransaction
}

type legacyImportRawRow struct {
	FileName        string  `json:"fileName"`
	SheetName       string  `json:"sheetName"`
	Section         string  `json:"section"`
	Label           string  `json:"label"`
	EntryIndex      int     `json:"entryIndex"`
	EntryCount      int     `json:"entryCount"`
	ApproximateDate string  `json:"approximateDate"`
	AmountMinor     int64   `json:"amountMinor"`
	AmountDisplay   float64 `json:"amountDisplay"`
	ExactDateKnown  bool    `json:"exactDateKnown"`
}

type legacyMappedTransaction struct {
	TransactionDate  string  `json:"transactionDate"`
	EntryKind        string  `json:"entryKind"`
	Amount           int64   `json:"amount"`
	Currency         string  `json:"currency"`
	AccountID        string  `json:"accountId"`
	CategoryName     *string `json:"categoryName,omitempty"`
	IncomeSourceName *string `json:"incomeSourceName,omitempty"`
	Note             *string `json:"note,omitempty"`
}

type workbookXML struct {
	Sheets []workbookSheetXML `xml:"sheets>sheet"`
}

type workbookSheetXML struct {
	Name string `xml:"name,attr"`
	ID   string `xml:"http://schemas.openxmlformats.org/officeDocument/2006/relationships id,attr"`
}

type workbookRelationshipsXML struct {
	Relationships []relationshipXML `xml:"Relationship"`
}

type relationshipXML struct {
	ID     string `xml:"Id,attr"`
	Target string `xml:"Target,attr"`
}

type worksheetXML struct {
	SheetData sheetDataXML `xml:"sheetData"`
}

type sheetDataXML struct {
	Rows []sheetRowXML `xml:"row"`
}

type sheetRowXML struct {
	Index int            `xml:"r,attr"`
	Cells []sheetCellXML `xml:"c"`
}

type sheetCellXML struct {
	Ref       string           `xml:"r,attr"`
	Type      string           `xml:"t,attr"`
	Value     string           `xml:"v"`
	InlineStr *inlineStringXML `xml:"is"`
}

type inlineStringXML struct {
	Text string `xml:"t"`
}

type sharedStringsXML struct {
	Items []sharedStringItemXML `xml:"si"`
}

type sharedStringItemXML struct {
	Text string               `xml:"t"`
	Runs []sharedStringRunXML `xml:"r"`
}

type sharedStringRunXML struct {
	Text string `xml:"t"`
}

// parseLegacyWorkbook reads the authoritative OVERALL summary sheet of a legacy
// yearly workbook. The per-month sheets keep several running-total columns that
// cannot be reliably told apart from real entries, so scraping them overcounts;
// the OVERALL sheet instead holds one clean monthly total per category, which is
// what these totals are imported from.
func parseLegacyWorkbook(fileName string, payload []byte, currency, accountID string) ([]legacyWorkbookEntry, error) {
	year, err := legacyWorkbookYear(fileName)
	if err != nil {
		return nil, err
	}

	reader, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return nil, fmt.Errorf("invalid workbook: %w", err)
	}

	files := map[string]*zip.File{}
	for _, file := range reader.File {
		files[file.Name] = file
	}

	workbookData, err := readZipFile(files, "xl/workbook.xml")
	if err != nil {
		return nil, err
	}
	relsData, err := readZipFile(files, "xl/_rels/workbook.xml.rels")
	if err != nil {
		return nil, err
	}

	var workbook workbookXML
	if err := xml.Unmarshal(workbookData, &workbook); err != nil {
		return nil, fmt.Errorf("invalid workbook metadata: %w", err)
	}

	var rels workbookRelationshipsXML
	if err := xml.Unmarshal(relsData, &rels); err != nil {
		return nil, fmt.Errorf("invalid workbook relationships: %w", err)
	}

	relTargets := make(map[string]string, len(rels.Relationships))
	for _, rel := range rels.Relationships {
		relTargets[rel.ID] = normalizeWorkbookPartPath(rel.Target)
	}

	sharedStrings, err := loadSharedStrings(files)
	if err != nil {
		return nil, err
	}

	overallPath := ""
	for _, sheet := range workbook.Sheets {
		if strings.EqualFold(strings.TrimSpace(sheet.Name), "OVERALL") {
			overallPath = relTargets[sheet.ID]
			break
		}
	}
	if overallPath == "" {
		return nil, fmt.Errorf("no OVERALL summary sheet was found in %s", fileName)
	}

	entries, err := parseOverallSheet(fileName, overallPath, year, sharedStrings, files, currency, accountID)
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return nil, fmt.Errorf("no monthly totals were found in the OVERALL sheet of %s", fileName)
	}
	return entries, nil
}

// parseOverallSheet turns each non-zero monthly total on the OVERALL sheet into
// one dated transaction. Rows are classified by section: the income block at the
// top, an optional savings block (INVESTMENTS & SAVINGS, CREDITORS), then the
// expense categories, delimited by bare-number subtotal rows and section-name
// header rows.
func parseOverallSheet(fileName, sheetPath string, year int, sharedStrings []string, files map[string]*zip.File, currency, accountID string) ([]legacyWorkbookEntry, error) {
	data, err := readZipFile(files, sheetPath)
	if err != nil {
		return nil, err
	}

	var worksheet worksheetXML
	if err := xml.Unmarshal(data, &worksheet); err != nil {
		return nil, fmt.Errorf("invalid OVERALL sheet in %s: %w", fileName, err)
	}

	firstColNum, firstMonth, headerRowIndex := overallMonthHeader(worksheet.SheetData.Rows, sharedStrings)
	if firstColNum == 0 {
		return nil, fmt.Errorf("could not find the month columns in the OVERALL sheet of %s", fileName)
	}

	inIncome := true
	var entries []legacyWorkbookEntry
	for _, row := range worksheet.SheetData.Rows {
		if row.Index <= headerRowIndex {
			continue
		}
		values := extractLegacyRowValues(row, sharedStrings)
		label := normalizeLegacyLabel(values["A"])

		// Divider rows carry no label in column A. They are either a section
		// header (section title in column B) or a subtotal (a summary number in
		// the far total column). The first subtotal ends the income block; every
		// category below it is a saving or an expense.
		if label == "" {
			section := normalizeLegacyLabel(values["B"])
			if isLegacySectionHeader(section) {
				inIncome = strings.EqualFold(section, "INCOME")
			} else if inIncome && rowHasAmount(values) {
				inIncome = false
			}
			continue
		}

		upperLabel := strings.ToUpper(label)
		if overallStopLabel(upperLabel) {
			break
		}
		if overallSkipLabel(upperLabel) {
			continue
		}

		entryKind := "expense_living"
		switch {
		case inIncome:
			entryKind = "income_earned"
		case isSavingsLabel(upperLabel):
			entryKind = "saving_transfer"
		}

		displayLabel := titleCaseLegacyLabel(label)
		monthAmounts := overallRowMonths(values, firstColNum, firstMonth)
		for _, ma := range monthAmounts {
			date := fmt.Sprintf("%04d-%02d-15", year, ma.month)
			monthLabel := monthNames[ma.month-1]
			note := fmt.Sprintf(
				"Imported from the %d workbook OVERALL summary: %s total for %s %d. The workbook stored only a monthly total, so the date is set to mid-month.",
				year, displayLabel, monthLabel, year,
			)

			mapped := legacyMappedTransaction{
				TransactionDate: date,
				EntryKind:       entryKind,
				Amount:          ma.amount,
				Currency:        currency,
				AccountID:       accountID,
				Note:            &note,
			}
			if entryKind == "income_earned" {
				mapped.IncomeSourceName = &displayLabel
			} else if entryKind == "expense_living" {
				mapped.CategoryName = &displayLabel
			}

			raw := legacyImportRawRow{
				FileName:        fileName,
				SheetName:       "Overall",
				Section:         sectionLabel(entryKind),
				Label:           displayLabel,
				EntryIndex:      ma.month,
				EntryCount:      len(monthAmounts),
				ApproximateDate: date,
				AmountMinor:     ma.amount,
				AmountDisplay:   float64(ma.amount) / 100,
				ExactDateKnown:  false,
			}

			entries = append(entries, legacyWorkbookEntry{Raw: raw, Mapped: mapped})
		}
	}

	return entries, nil
}

// rowHasAmount reports whether a row carries any non-zero number outside the
// label column, used to tell a real subtotal divider from a blank spacer row.
func rowHasAmount(values map[string]string) bool {
	for col, raw := range values {
		if col == "A" {
			continue
		}
		if amount, ok := parseLegacyAmount(raw); ok && amount != 0 {
			return true
		}
	}
	return false
}

type overallMonthAmount struct {
	month  int
	amount int64
}

// overallRowMonths reads the monthly amount cells of a category row, mapping each
// data column to its calendar month. The label column and the trailing total
// columns fall outside month 1..12 and are ignored.
func overallRowMonths(values map[string]string, firstColNum, firstMonth int) []overallMonthAmount {
	var result []overallMonthAmount
	for col, raw := range values {
		if col == "A" {
			continue
		}
		month := firstMonth + (columnNumber(col) - firstColNum)
		if month < 1 || month > 12 {
			continue
		}
		amount, ok := parseLegacyAmount(raw)
		if !ok || amount <= 0 {
			continue
		}
		result = append(result, overallMonthAmount{month: month, amount: amount})
	}
	// Chronological order keeps the preview and imported rows reading top-down.
	sortMonthAmounts(result)
	return result
}

func sortMonthAmounts(items []overallMonthAmount) {
	for i := 1; i < len(items); i++ {
		for j := i; j > 0 && items[j-1].month > items[j].month; j-- {
			items[j-1], items[j] = items[j], items[j-1]
		}
	}
}

// overallMonthHeader finds the header row that names the months and returns the
// first data column, the month it represents, and the header row index. The
// header labels months from the second data column onward, so the first data
// column (B) is one month earlier than the first labelled column.
func overallMonthHeader(rows []sheetRowXML, sharedStrings []string) (firstColNum, firstMonth, headerRowIndex int) {
	for _, row := range rows {
		values := extractLegacyRowValues(row, sharedStrings)
		smallestCol, smallestMonth, labelled := 0, 0, 0
		for col, v := range values {
			if col == "A" {
				continue
			}
			month := monthIndexFromName(v)
			if month == 0 {
				continue
			}
			labelled++
			cn := columnNumber(col)
			if smallestCol == 0 || cn < smallestCol {
				smallestCol = cn
				smallestMonth = month
			}
		}
		if labelled < 2 {
			continue
		}
		// The column before the first labelled one holds the first month of data.
		return smallestCol - 1, smallestMonth - 1, row.Index
	}
	return 0, 0, 0
}

func extractLegacyRowValues(row sheetRowXML, sharedStrings []string) map[string]string {
	values := make(map[string]string, len(row.Cells))
	for _, cell := range row.Cells {
		column := columnLetters(cell.Ref)
		if column == "" {
			continue
		}
		values[column] = cellValue(cell, sharedStrings)
	}
	return values
}

func legacyWorkbookYear(fileName string) (int, error) {
	match := legacyWorkbookYearPattern.FindString(fileName)
	if match == "" {
		return 0, fmt.Errorf("could not find a year in %s", fileName)
	}
	year, err := strconv.Atoi(match)
	if err != nil {
		return 0, fmt.Errorf("invalid workbook year in %s", fileName)
	}
	return year, nil
}

// monthIndexFromName maps a month name or common abbreviation (JAN, SEPT, MARCH,
// …) to its 1-based index, or 0 when the text is not a month.
func monthIndexFromName(value string) int {
	trimmed := strings.ToUpper(normalizeLegacyLabel(value))
	if len(trimmed) < 3 {
		return 0
	}
	prefix := trimmed[:3]
	switch prefix {
	case "JAN":
		return 1
	case "FEB":
		return 2
	case "MAR":
		return 3
	case "APR":
		return 4
	case "MAY":
		return 5
	case "JUN":
		return 6
	case "JUL":
		return 7
	case "AUG":
		return 8
	case "SEP":
		return 9
	case "OCT":
		return 10
	case "NOV":
		return 11
	case "DEC":
		return 12
	default:
		return 0
	}
}

func sectionLabel(entryKind string) string {
	switch entryKind {
	case "income_earned":
		return "Income"
	case "saving_transfer":
		return "Savings"
	default:
		return "Expenses"
	}
}

// normalizeWorkbookPartPath resolves a workbook relationship Target to a
// zip-root path. Some exporters write targets absolute from the package root
// ("/xl/worksheets/sheet1.xml"); others write them relative to the workbook
// part's own folder, xl/ ("worksheets/sheet1.xml"). Prepending "xl/"
// unconditionally turns the absolute form into "xl/xl/..." and the part is
// then not found, so the two cases are handled separately.
func normalizeWorkbookPartPath(target string) string {
	if strings.HasPrefix(target, "/") {
		return strings.TrimPrefix(target, "/")
	}
	return "xl/" + target
}

func loadSharedStrings(files map[string]*zip.File) ([]string, error) {
	file, ok := files["xl/sharedStrings.xml"]
	if !ok {
		return nil, nil
	}
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	var stringsXML sharedStringsXML
	if err := xml.NewDecoder(reader).Decode(&stringsXML); err != nil {
		return nil, fmt.Errorf("invalid shared strings: %w", err)
	}

	result := make([]string, 0, len(stringsXML.Items))
	for _, item := range stringsXML.Items {
		if item.Text != "" {
			result = append(result, item.Text)
			continue
		}
		var builder strings.Builder
		for _, run := range item.Runs {
			builder.WriteString(run.Text)
		}
		result = append(result, builder.String())
	}
	return result, nil
}

func readZipFile(files map[string]*zip.File, name string) ([]byte, error) {
	file, ok := files[name]
	if !ok {
		return nil, fmt.Errorf("missing workbook part %s", name)
	}
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	return ioReadAll(reader)
}

func cellValue(cell sheetCellXML, sharedStrings []string) string {
	switch cell.Type {
	case "s":
		index, err := strconv.Atoi(strings.TrimSpace(cell.Value))
		if err != nil || index < 0 || index >= len(sharedStrings) {
			return ""
		}
		return sharedStrings[index]
	case "inlineStr":
		if cell.InlineStr == nil {
			return ""
		}
		return cell.InlineStr.Text
	default:
		return cell.Value
	}
}

func parseLegacyAmount(value string) (int64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	number, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, false
	}
	return int64(math.Round(number * 100)), true
}

func columnLetters(ref string) string {
	var builder strings.Builder
	for _, r := range ref {
		if unicode.IsLetter(r) {
			builder.WriteRune(unicode.ToUpper(r))
			continue
		}
		break
	}
	return builder.String()
}

func columnNumber(column string) int {
	result := 0
	for _, r := range column {
		if !unicode.IsLetter(r) {
			break
		}
		result = result*26 + int(unicode.ToUpper(r)-'A'+1)
	}
	return result
}

func normalizeLegacyLabel(value string) string {
	value = strings.TrimSpace(value)
	value = strings.Trim(value, " ")
	return strings.TrimSpace(value)
}

func titleCaseLegacyLabel(value string) string {
	parts := strings.Fields(strings.ToLower(normalizeLegacyLabel(value)))
	for index, part := range parts {
		runes := []rune(part)
		if len(runes) == 0 {
			continue
		}
		runes[0] = unicode.ToUpper(runes[0])
		parts[index] = string(runes)
	}
	return strings.Join(parts, " ")
}

func isLegacySectionHeader(value string) bool {
	switch strings.ToUpper(normalizeLegacyLabel(value)) {
	case "INCOME", "UTILITIES", "TRANSPORT", "TAKE OUTS", "TECH", "PERSONAL", "GROOMING":
		return true
	default:
		return false
	}
}

func isSavingsLabel(upperLabel string) bool {
	switch upperLabel {
	case "INVESTMENTS & SAVINGS", "INVESTMENTS AND SAVINGS", "SAVINGS", "CREDITORS":
		return true
	default:
		return false
	}
}

// overallStopLabel marks the end of the category rows; nothing below the expense
// total line should be imported.
func overallStopLabel(upperLabel string) bool {
	switch upperLabel {
	case "EXPENSE TOTALS", "EXPENSE TOTAL", "TOTAL EXPENSES", "TOTAL OWING":
		return true
	default:
		return false
	}
}

func overallSkipLabel(upperLabel string) bool {
	switch upperLabel {
	case "AMOUNT BROUGHT FORWARD", "BROUGHT FORWARD", "TOTAL INCOME", "OVERALL BALANCE", "CREDITORS TOTAL":
		return true
	default:
		return false
	}
}

func ioReadAll(reader io.Reader) ([]byte, error) {
	return io.ReadAll(reader)
}

func marshalLegacyJSON(value any) json.RawMessage {
	data, _ := json.Marshal(value)
	return data
}

func inferIncomeSourceType(name string) string {
	normalized := strings.ToLower(normalizeLegacyLabel(name))
	switch {
	case strings.Contains(normalized, "salary"):
		return "salary"
	case strings.Contains(normalized, "project"), strings.Contains(normalized, "consult"):
		return "business"
	default:
		return "other"
	}
}
