package config

import (
	"errors"
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"
)

const (
	defaultDatabaseURL          = "postgres://postgres:postgres@127.0.0.1:5432/expense_tracker?sslmode=disable"
	defaultJWTSecret            = "change-me"
	defaultPort                 = "8080"
	defaultCookieName           = "chuma_auth"
	defaultCookieSameSite       = "lax"
	defaultMaxBodyBytes   int64 = 25 << 20
)

type Config struct {
	DatabaseURL            string
	JWTSecret              string
	AppOrigins             []string
	AdminBootstrapEmail    string
	AdminBootstrapPassword string
	Port                   string
	AppEnv                 string
	CookieName             string
	CookieSecure           bool
	CookieSameSite         string
	MaxBodyBytes           int64
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL:            envOrDefault("DATABASE_URL", defaultDatabaseURL),
		JWTSecret:              envOrDefault("JWT_SECRET", defaultJWTSecret),
		AppOrigins:             mergeOrigins(defaultAppOrigins(), splitOrigins(os.Getenv("APP_ORIGIN"))),
		AdminBootstrapEmail:    os.Getenv("ADMIN_BOOTSTRAP_EMAIL"),
		AdminBootstrapPassword: os.Getenv("ADMIN_BOOTSTRAP_PASSWORD"),
		Port:                   envOrDefault("PORT", defaultPort),
		AppEnv:                 strings.ToLower(envOrDefault("APP_ENV", "development")),
		CookieName:             envOrDefault("AUTH_COOKIE_NAME", defaultCookieName),
		CookieSameSite:         strings.ToLower(envOrDefault("AUTH_COOKIE_SAMESITE", defaultCookieSameSite)),
	}

	if cfg.AppEnv == "" {
		cfg.AppEnv = "development"
	}

	cfg.CookieSecure = cfg.IsProduction()

	var err error
	cfg.MaxBodyBytes, err = envOrDefaultInt64("MAX_BODY_BYTES", defaultMaxBodyBytes)
	if err != nil {
		return Config{}, err
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}

	if cfg.JWTSecret == "" {
		return Config{}, errors.New("JWT_SECRET is required")
	}

	if !isValidSameSite(cfg.CookieSameSite) {
		return Config{}, fmt.Errorf("AUTH_COOKIE_SAMESITE must be one of lax, strict, or none")
	}

	if cfg.IsProduction() {
		if cfg.JWTSecret == defaultJWTSecret {
			return Config{}, errors.New("JWT_SECRET must be set to a non-default value in production")
		}
		if cfg.DatabaseURL == defaultDatabaseURL {
			return Config{}, errors.New("DATABASE_URL must be set to a non-default value in production")
		}
		if cfg.CookieSameSite == "none" {
			cfg.CookieSecure = true
		}
	}

	return cfg, nil
}

func (c Config) IsProduction() bool {
	return c.AppEnv == "production"
}

func envOrDefault(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}

func envOrDefaultInt64(key string, fallback int64) (int64, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", key)
	}

	return parsed, nil
}

func splitOrigins(value string) []string {
	if value == "" {
		return nil
	}

	parts := strings.Split(value, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		origin := strings.TrimSpace(part)
		if origin == "" {
			continue
		}
		origins = append(origins, origin)
	}

	return origins
}

func defaultAppOrigins() []string {
	return []string{
		"http://localhost:3000",
		"http://127.0.0.1:3000",
	}
}

func mergeOrigins(groups ...[]string) []string {
	origins := make([]string, 0)
	for _, group := range groups {
		for _, origin := range group {
			if origin == "" || slices.Contains(origins, origin) {
				continue
			}
			origins = append(origins, origin)
		}
	}

	return origins
}

func isValidSameSite(value string) bool {
	switch value {
	case "lax", "strict", "none":
		return true
	default:
		return false
	}
}
