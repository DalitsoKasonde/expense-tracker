package config

import (
	"errors"
	"os"
	"slices"
	"strings"
)

type Config struct {
	DatabaseURL            string
	JWTSecret              string
	AppOrigins             []string
	AdminBootstrapEmail    string
	AdminBootstrapPassword string
	Port                   string
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		JWTSecret:              os.Getenv("JWT_SECRET"),
		AppOrigins:             mergeOrigins(defaultAppOrigins(), splitOrigins(os.Getenv("APP_ORIGIN"))),
		AdminBootstrapEmail:    os.Getenv("ADMIN_BOOTSTRAP_EMAIL"),
		AdminBootstrapPassword: os.Getenv("ADMIN_BOOTSTRAP_PASSWORD"),
		Port:                   envOrDefault("PORT", "8080"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}

	if cfg.JWTSecret == "" {
		return Config{}, errors.New("JWT_SECRET is required")
	}

	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
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
