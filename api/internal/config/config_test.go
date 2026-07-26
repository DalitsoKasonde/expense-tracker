package config

import "testing"

func TestLoadAppVersionDefaultsToDev(t *testing.T) {
	t.Setenv("APP_VERSION", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.AppVersion != "dev" {
		t.Fatalf("AppVersion = %q, want %q", cfg.AppVersion, "dev")
	}
}

func TestLoadAppVersionFromEnvironment(t *testing.T) {
	const sha = "0123456789abcdef0123456789abcdef01234567"
	t.Setenv("APP_VERSION", sha)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.AppVersion != sha {
		t.Fatalf("AppVersion = %q, want %q", cfg.AppVersion, sha)
	}
}
