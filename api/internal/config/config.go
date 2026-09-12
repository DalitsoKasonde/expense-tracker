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
	defaultAppVersion           = "dev"
	defaultSMTPPort             = 587
	defaultMailFromName         = "Chuma"
	defaultAppPublicURL         = "http://localhost:3000"
)

type Config struct {
	DatabaseURL                  string
	JWTSecret                    string
	AppOrigins                   []string
	AdminBootstrapEmail          string
	AdminBootstrapPassword       string
	SystemAdminBootstrapEmail    string
	SystemAdminBootstrapPassword string
	Port                         string
	AppEnv                       string
	// AppVersion identifies the running build. Deploys set it to the git
	// commit SHA so /healthz can prove which build is live.
	AppVersion          string
	CookieName          string
	CookieSecure        bool
	CookieSameSite      string
	MaxBodyBytes        int64
	MansaAPIKey         string
	BackupDir           string
	BackupEncryptionKey string

	// Mail. SMTPHost empty means outgoing mail is disabled: the app still
	// works, it just logs what it would have sent instead of sending it.
	SMTPHost        string
	SMTPPort        int
	SMTPUsername    string
	SMTPPassword    string
	MailFromAddress string
	MailFromName    string
	// AppPublicURL is the origin links in emails point at. Emails are read
	// outside the app, so a relative href is useless and there is no request
	// to infer the host from.
	AppPublicURL string
	// AdminAlertEmail receives operator mail such as new user feedback.
	AdminAlertEmail string
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL:                  envOrDefault("DATABASE_URL", defaultDatabaseURL),
		JWTSecret:                    envOrDefault("JWT_SECRET", defaultJWTSecret),
		AppOrigins:                   mergeOrigins(defaultAppOrigins(), splitOrigins(os.Getenv("APP_ORIGIN"))),
		AdminBootstrapEmail:          os.Getenv("ADMIN_BOOTSTRAP_EMAIL"),
		AdminBootstrapPassword:       os.Getenv("ADMIN_BOOTSTRAP_PASSWORD"),
		SystemAdminBootstrapEmail:    os.Getenv("SYSTEM_ADMIN_BOOTSTRAP_EMAIL"),
		SystemAdminBootstrapPassword: os.Getenv("SYSTEM_ADMIN_BOOTSTRAP_PASSWORD"),
		Port:                         envOrDefault("PORT", defaultPort),
		AppEnv:                       strings.ToLower(envOrDefault("APP_ENV", "development")),
		AppVersion:                   envOrDefault("APP_VERSION", defaultAppVersion),
		CookieName:                   envOrDefault("AUTH_COOKIE_NAME", defaultCookieName),
		CookieSameSite:               strings.ToLower(envOrDefault("AUTH_COOKIE_SAMESITE", defaultCookieSameSite)),
		MansaAPIKey:                  os.Getenv("MANSA_API_KEY"),
		BackupDir:                    os.Getenv("BACKUP_DIR"),
		BackupEncryptionKey:          os.Getenv("BACKUP_ENCRYPTION_KEY"),
		SMTPHost:                     strings.TrimSpace(os.Getenv("SMTP_HOST")),
		SMTPUsername:                 os.Getenv("SMTP_USERNAME"),
		SMTPPassword:                 os.Getenv("SMTP_PASSWORD"),
		MailFromAddress:              strings.TrimSpace(os.Getenv("MAIL_FROM_ADDRESS")),
		MailFromName:                 envOrDefault("MAIL_FROM_NAME", defaultMailFromName),
		AppPublicURL:                 strings.TrimRight(envOrDefault("APP_PUBLIC_URL", defaultAppPublicURL), "/"),
		AdminAlertEmail:              strings.TrimSpace(strings.ToLower(os.Getenv("ADMIN_ALERT_EMAIL"))),
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

	port, err := envOrDefaultInt64("SMTP_PORT", defaultSMTPPort)
	if err != nil {
		return Config{}, err
	}
	cfg.SMTPPort = int(port)

	// Catching this at boot beats discovering it when a password reset is
	// already in flight and there is no address to send it from.
	if cfg.SMTPHost != "" && cfg.MailFromAddress == "" {
		return Config{}, errors.New("MAIL_FROM_ADDRESS is required when SMTP_HOST is set")
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

// MailEnabled reports whether a relay is configured. Callers use it to decide
// whether to offer a feature that depends on delivery, rather than promising
// an email that would only ever reach the log.
func (c Config) MailEnabled() bool {
	return c.SMTPHost != ""
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
