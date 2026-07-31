package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	mansaAPIBaseURL = "https://mansaapi.com"
	mansaSourceName = "Mansa Markets"
)

var luseTickerPattern = regexp.MustCompile(`^[A-Z0-9-]{1,16}$`)

type marketDataHTTPClient interface {
	Do(*http.Request) (*http.Response, error)
}

type mansaQuoteResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Ticker      string  `json:"ticker"`
		Name        string  `json:"name"`
		Price       float64 `json:"price"`
		Change      float64 `json:"change"`
		ChangePct   float64 `json:"change_pct"`
		LastUpdated string  `json:"last_updated"`
	} `json:"data"`
	Meta struct {
		Currency  string `json:"currency"`
		UpdatedAt string `json:"updated_at"`
	} `json:"meta"`
	Error   string `json:"error"`
	Message string `json:"message"`
}

type marketQuote struct {
	Ticker          string  `json:"ticker"`
	Name            string  `json:"name"`
	PriceMinor      int64   `json:"priceMinor"`
	ChangeMinor     int64   `json:"changeMinor"`
	ChangePercent   float64 `json:"changePercent"`
	Currency        string  `json:"currency"`
	QuotedAt        string  `json:"quotedAt"`
	MarketDate      string  `json:"marketDate"`
	SourceName      string  `json:"sourceName"`
	SourceURL       string  `json:"sourceUrl"`
	RefreshInterval string  `json:"refreshInterval"`
}

func (s *Server) getLuSEQuote(w http.ResponseWriter, r *http.Request) {
	if s.config.MansaAPIKey == "" {
		http.Error(w, "market price lookup is not configured", http.StatusServiceUnavailable)
		return
	}

	ticker := strings.ToUpper(strings.TrimSpace(chi.URLParam(r, "ticker")))
	if !luseTickerPattern.MatchString(ticker) {
		http.Error(w, "invalid LuSE ticker", http.StatusBadRequest)
		return
	}

	client := &http.Client{Timeout: 10 * time.Second}
	quote, err := fetchMansaQuote(r.Context(), client, mansaAPIBaseURL, s.config.MansaAPIKey, ticker)
	if err != nil {
		writeInternalError(w, r, "market_data.luse.quote", "market price is temporarily unavailable", err)
		return
	}

	writeJSON(w, http.StatusOK, quote)
}

func fetchMansaQuote(
	ctx context.Context,
	client marketDataHTTPClient,
	baseURL string,
	apiKey string,
	ticker string,
) (marketQuote, error) {
	endpoint := fmt.Sprintf(
		"%s/api/v1/markets/exchanges/LUSE/stocks/%s",
		strings.TrimRight(baseURL, "/"),
		ticker,
	)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return marketQuote{}, err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Accept", "application/json")

	response, err := client.Do(request)
	if err != nil {
		return marketQuote{}, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return marketQuote{}, fmt.Errorf("Mansa returned status %d", response.StatusCode)
	}

	var payload mansaQuoteResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return marketQuote{}, err
	}
	if !payload.Success || payload.Data.Price <= 0 {
		message := payload.Error
		if message == "" {
			message = payload.Message
		}
		if message == "" {
			message = "quote response did not contain a price"
		}
		return marketQuote{}, errors.New(message)
	}

	quotedAt := payload.Data.LastUpdated
	if quotedAt == "" {
		quotedAt = payload.Meta.UpdatedAt
	}
	marketDate := quotedAt
	if len(marketDate) >= 10 {
		marketDate = marketDate[:10]
	}

	slug := strings.ToLower(payload.Data.Ticker)
	return marketQuote{
		Ticker:          payload.Data.Ticker,
		Name:            payload.Data.Name,
		PriceMinor:      int64(math.Round(payload.Data.Price * 100)),
		ChangeMinor:     int64(math.Round(payload.Data.Change * 100)),
		ChangePercent:   payload.Data.ChangePct,
		Currency:        payload.Meta.Currency,
		QuotedAt:        quotedAt,
		MarketDate:      marketDate,
		SourceName:      mansaSourceName,
		SourceURL:       "https://www.mansamarkets.com/zambia/" + slug,
		RefreshInterval: "30 minutes during LuSE trading hours",
	}, nil
}
