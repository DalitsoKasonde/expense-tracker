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
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"
)

var (
	legacyWorkbookYearPattern = regexp.MustCompile(`(?:19|20)\d{2}`)
	monthSheetNames           = []string{
		"JANUARY",
		"FEBRUARY",
		"MARCH",
		"APRIL",
		"MAY",
		"JUNE",
		"JULY",
		"AUGUST",
		"SEPTEMBER",
		"OCTOBER",
		"NOVEMBER",
		"DECEMBER",
	}
)

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
		relTargets[rel.ID] = "xl/" + strings.TrimPrefix(rel.Target, "/")
	}

	sharedStrings, err := loadSharedStrings(files)
	if err != nil {
		return nil, err
	}

	var entries []legacyWorkbookEntry
	for _, monthName := range monthSheetNames {
		sheetPath := ""
		for _, sheet := range workbook.Sheets {
			if strings.EqualFold(strings.TrimSpace(sheet.Name), monthName) {
				sheetPath = relTargets[sheet.ID]
				break
			}
		}
		if sheetPath == "" {
			continue
		}

		sheetEntries, err := parseLegacyMonthSheet(fileName, sheetPath, monthName, year, sharedStrings, files, currency, accountID)
		if err != nil {
			return nil, err
		}
		entries = append(entries, sheetEntries...)
	}

	if len(entries) == 0 {
		return nil, fmt.Errorf("no monthly transactions were found in %s", fileName)
	}

	return entries, nil
}

func parseLegacyMonthSheet(fileName, sheetPath, sheetName string, year int, sharedStrings []string, files map[string]*zip.File, currency, accountID string) ([]legacyWorkbookEntry, error) {
	data, err := readZipFile(files, sheetPath)
	if err != nil {
		return nil, err
	}

	var worksheet worksheetXML
	if err := xml.Unmarshal(data, &worksheet); err != nil {
		return nil, fmt.Errorf("invalid worksheet %s: %w", sheetName, err)
	}

	monthIndex, err := monthIndexForSheet(sheetName)
	if err != nil {
		return nil, err
	}
	daysInMonth := time.Date(year, time.Month(monthIndex)+1, 0, 0, 0, 0, 0, time.UTC).Day()

	currentSection := ""
	var entries []legacyWorkbookEntry

	for _, row := range worksheet.SheetData.Rows {
		values := extractLegacyRowValues(row, sharedStrings)
		label := normalizeLegacyLabel(values["A"])
		bValue := normalizeLegacyLabel(values["B"])

		if label == "" && isLegacySectionHeader(bValue) {
			currentSection = bValue
			continue
		}
		if label == "" || shouldSkipLegacyLabel(label) {
			continue
		}

		slotValues := legacyEntryAmounts(values)
		if len(slotValues) == 0 {
			continue
		}

		for index, amountMinor := range slotValues {
			approxDate := legacyApproximateDate(year, monthIndex, daysInMonth, index, len(slotValues))
			entryKind := "expense_living"
			var categoryName *string
			var incomeSourceName *string
			displayLabel := titleCaseLegacyLabel(label)
			noteText := fmt.Sprintf("Imported from legacy workbook %s (%s, %s, entry %d of %d). Exact transaction date was not stored in the source workbook, so the date is approximate.", fileName, titleCaseLegacyLabel(sheetName), displayLabel, index+1, len(slotValues))

			if strings.EqualFold(currentSection, "INCOME") || isLegacyIncomeLabel(label) {
				entryKind = "income_earned"
				incomeSourceName = &displayLabel
				if strings.EqualFold(label, "BORROWED") {
					noteText = fmt.Sprintf("%s Borrowing detail was preserved as cashflow only; loan balances were not recreated from the workbook.", noteText)
				}
			} else {
				categoryName = &displayLabel
				if strings.EqualFold(label, "DEBT REPAYMENT") {
					noteText = fmt.Sprintf("%s Debt repayment detail was imported as expense cashflow only.", noteText)
				}
			}

			raw := legacyImportRawRow{
				FileName:        fileName,
				SheetName:       titleCaseLegacyLabel(sheetName),
				Section:         titleCaseLegacyLabel(currentSection),
				Label:           displayLabel,
				EntryIndex:      index + 1,
				EntryCount:      len(slotValues),
				ApproximateDate: approxDate,
				AmountMinor:     amountMinor,
				AmountDisplay:   float64(amountMinor) / 100,
				ExactDateKnown:  false,
			}
			mapped := legacyMappedTransaction{
				TransactionDate:  approxDate,
				EntryKind:        entryKind,
				Amount:           amountMinor,
				Currency:         currency,
				AccountID:        accountID,
				CategoryName:     categoryName,
				IncomeSourceName: incomeSourceName,
				Note:             &noteText,
			}

			entries = append(entries, legacyWorkbookEntry{Raw: raw, Mapped: mapped})
		}
	}

	return entries, nil
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

func legacyEntryAmounts(values map[string]string) []int64 {
	type slot struct {
		column int
		amount int64
	}
	var amounts []slot
	for column, raw := range values {
		if column == "A" {
			continue
		}
		number, ok := parseLegacyAmount(raw)
		if !ok {
			continue
		}
		amounts = append(amounts, slot{column: columnNumber(column), amount: number})
	}
	if len(amounts) <= 1 {
		return nil
	}
	slices.SortFunc(amounts, func(left, right slot) int {
		return left.column - right.column
	})
	amounts = amounts[:len(amounts)-1]
	result := make([]int64, 0, len(amounts))
	for _, item := range amounts {
		if item.amount > 0 {
			result = append(result, item.amount)
		}
	}
	return result
}

func legacyApproximateDate(year, month, daysInMonth, index, count int) string {
	day := 1
	if count > 1 {
		day = 1 + int(math.Round(float64(index)*float64(daysInMonth-1)/float64(count-1)))
	}
	if day < 1 {
		day = 1
	}
	if day > daysInMonth {
		day = daysInMonth
	}
	return time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
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

func monthIndexForSheet(sheetName string) (int, error) {
	for index, name := range monthSheetNames {
		if strings.EqualFold(strings.TrimSpace(sheetName), name) {
			return index + 1, nil
		}
	}
	return 0, fmt.Errorf("unsupported month sheet %s", sheetName)
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
	value = strings.Trim(value, "\u00a0")
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
	case "INCOME", "UTILITIES", "TRANSPORT", "TAKE OUTS", "TECH":
		return true
	default:
		return false
	}
}

func isLegacyIncomeLabel(label string) bool {
	switch strings.ToUpper(normalizeLegacyLabel(label)) {
	case "NET SALARY", "PROJECTS", "OTHER", "BORROWED":
		return true
	default:
		return false
	}
}

func shouldSkipLegacyLabel(label string) bool {
	switch strings.ToUpper(normalizeLegacyLabel(label)) {
	case "AMOUNT BROUGHT FORWARD", "BROUGHT FORWARD", "TOTAL INCOME", "TOTAL EXPENSES", "OVERALL BALANCE":
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
