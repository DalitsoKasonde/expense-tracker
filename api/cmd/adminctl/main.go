package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/config"
	"github.com/dalitsokasonde/expense-tracker/api/internal/database"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	email := strings.ToLower(strings.TrimSpace(os.Getenv("SYSTEM_ADMIN_EMAIL")))
	password := os.Getenv("SYSTEM_ADMIN_PASSWORD")
	displayName := strings.TrimSpace(os.Getenv("SYSTEM_ADMIN_DISPLAY_NAME"))
	if displayName == "" {
		displayName = "System administrator"
	}
	if email == "" || password == "" {
		log.Fatal("SYSTEM_ADMIN_EMAIL and SYSTEM_ADMIN_PASSWORD are required")
	}
	if err := auth.ValidatePassword(password); err != nil {
		log.Fatal(err)
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		log.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	user, err := store.NewUserStore(db).CreateSystemAdmin(ctx, email, hash, displayName)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("created system administrator %s\n", user.ID)
}
