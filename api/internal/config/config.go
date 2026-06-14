package config

import (
	"errors"
	"os"
)

type Config struct {
	DatabaseURL            string
	JWTSecret              string
	AppOrigin              string
	AdminBootstrapEmail    string
	AdminBootstrapPassword string
	Port                   string
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		JWTSecret:              os.Getenv("JWT_SECRET"),
		AppOrigin:              os.Getenv("APP_ORIGIN"),
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

	if cfg.AppOrigin == "" {
		cfg.AppOrigin = "http://localhost:3000"
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

