package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/config"
	"github.com/dalitsokasonde/expense-tracker/api/internal/database"
	"github.com/dalitsokasonde/expense-tracker/api/internal/httpapi"
	"github.com/dalitsokasonde/expense-tracker/api/internal/migrations"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := migrations.RunWithOptions(ctx, db, "up", filepath.Join("migrations"), migrations.Options{
		SkipDevelopmentSeeds: cfg.IsProduction(),
	}); err != nil {
		log.Fatal(err)
	}
	if err := bootstrapSystemAdmin(ctx, cfg, store.NewUserStore(db)); err != nil {
		log.Fatal(err)
	}

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.New(cfg, db),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("api listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}

func bootstrapSystemAdmin(ctx context.Context, cfg config.Config, users *store.UserStore) error {
	email := strings.ToLower(strings.TrimSpace(cfg.SystemAdminBootstrapEmail))
	password := cfg.SystemAdminBootstrapPassword
	if email == "" && password == "" {
		return nil
	}
	if email == "" || password == "" {
		return fmt.Errorf("SYSTEM_ADMIN_BOOTSTRAP_EMAIL and SYSTEM_ADMIN_BOOTSTRAP_PASSWORD must both be set")
	}
	count, err := users.CountSystemAdmins(ctx)
	if err != nil {
		return fmt.Errorf("count system administrators: %w", err)
	}
	if count > 0 {
		return nil
	}
	if err := auth.ValidatePassword(password); err != nil {
		return fmt.Errorf("invalid system administrator bootstrap password: %w", err)
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash system administrator bootstrap password: %w", err)
	}
	user, err := users.CreateSystemAdmin(ctx, email, hash, "System administrator")
	if err != nil {
		return fmt.Errorf("create bootstrap system administrator: %w", err)
	}
	log.Printf("created bootstrap system administrator %s; remove the bootstrap credentials from the environment", user.ID)
	return nil
}
