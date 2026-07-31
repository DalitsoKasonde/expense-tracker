package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchMansaQuoteNormalizesMarketData(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("Authorization header = %q", got)
		}
		if r.URL.Path != "/api/v1/markets/exchanges/LUSE/stocks/ATEL" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"success": true,
			"data": {
				"ticker": "ATEL",
				"name": "Airtel Networks",
				"price": 194.99,
				"change": 9.99,
				"change_pct": 5.4,
				"last_updated": "2026-07-30T10:55:04.074+00:00"
			},
			"meta": {
				"currency": "ZMW",
				"updated_at": "2026-07-30T10:55:04.074+00:00"
			}
		}`))
	}))
	defer server.Close()

	quote, err := fetchMansaQuote(
		context.Background(),
		server.Client(),
		server.URL,
		"test-key",
		"ATEL",
	)
	if err != nil {
		t.Fatalf("fetchMansaQuote() error = %v", err)
	}

	if quote.PriceMinor != 19499 {
		t.Fatalf("PriceMinor = %d, want 19499", quote.PriceMinor)
	}
	if quote.MarketDate != "2026-07-30" {
		t.Fatalf("MarketDate = %q, want 2026-07-30", quote.MarketDate)
	}
	if quote.Currency != "ZMW" || quote.SourceName != "Mansa Markets" {
		t.Fatalf("unexpected quote metadata: %#v", quote)
	}
}

func TestFetchMansaQuoteRejectsMissingPrice(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"ticker":"ATEL","price":0}}`))
	}))
	defer server.Close()

	if _, err := fetchMansaQuote(
		context.Background(),
		server.Client(),
		server.URL,
		"test-key",
		"ATEL",
	); err == nil {
		t.Fatal("fetchMansaQuote() error = nil, want missing price error")
	}
}
