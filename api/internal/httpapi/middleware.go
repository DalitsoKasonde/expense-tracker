package httpapi

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

func limitRequestBody(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}

type authRateLimiter struct {
	limit  int
	window time.Duration

	mu      sync.Mutex
	clients map[string][]time.Time
}

func newAuthRateLimiter(limit int, window time.Duration) *authRateLimiter {
	return &authRateLimiter{
		limit:   limit,
		window:  window,
		clients: make(map[string][]time.Time),
	}
}

func (l *authRateLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		if ip == "" {
			ip = "unknown"
		}

		now := time.Now()

		l.mu.Lock()
		requests := l.clients[ip]
		cutoff := now.Add(-l.window)
		pruned := requests[:0]
		for _, ts := range requests {
			if ts.After(cutoff) {
				pruned = append(pruned, ts)
			}
		}

		if len(pruned) >= l.limit {
			l.clients[ip] = pruned
			l.mu.Unlock()
			http.Error(w, "too many authentication attempts", http.StatusTooManyRequests)
			return
		}

		l.clients[ip] = append(pruned, now)
		l.mu.Unlock()

		next.ServeHTTP(w, r)
	})
}

func clientIP(r *http.Request) string {
	for _, header := range []string{"CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP"} {
		if value := strings.TrimSpace(r.Header.Get(header)); value != "" {
			if header == "X-Forwarded-For" {
				parts := strings.Split(value, ",")
				return strings.TrimSpace(parts[0])
			}
			return value
		}
	}

	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil {
		return host
	}

	return strings.TrimSpace(r.RemoteAddr)
}
