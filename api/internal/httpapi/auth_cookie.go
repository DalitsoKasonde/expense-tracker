package httpapi

import (
	"net/http"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/config"
)

const authCookieTTL = 24 * time.Hour

func setAuthCookie(w http.ResponseWriter, cfg config.Config, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     cfg.CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: cookieSameSite(cfg.CookieSameSite),
		MaxAge:   int(authCookieTTL.Seconds()),
	})
}

func clearAuthCookie(w http.ResponseWriter, cfg config.Config) {
	http.SetCookie(w, &http.Cookie{
		Name:     cfg.CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: cookieSameSite(cfg.CookieSameSite),
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func cookieSameSite(value string) http.SameSite {
	switch value {
	case "strict":
		return http.SameSiteStrictMode
	case "none":
		return http.SameSiteNoneMode
	default:
		return http.SameSiteLaxMode
	}
}
