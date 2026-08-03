package httpapi

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const encryptedBackupMagic = "EXPBACKUP1"

func (s *Server) executeBackup(jobID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	if err := s.admin.StartBackup(ctx, jobID); err != nil {
		return
	}
	if err := os.MkdirAll(s.config.BackupDir, 0700); err != nil {
		_ = s.admin.FailBackup(ctx, jobID, "could not prepare backup storage")
		return
	}
	temporary, err := os.CreateTemp(s.config.BackupDir, ".database-*.dump")
	if err != nil {
		_ = s.admin.FailBackup(ctx, jobID, "could not prepare backup file")
		return
	}
	temporaryPath := temporary.Name()
	_ = temporary.Chmod(0600)
	_ = temporary.Close()
	defer os.Remove(temporaryPath)

	if err := runPGDump(ctx, s.config.DatabaseURL, temporaryPath); err != nil {
		_ = s.admin.FailBackup(ctx, jobID, "database export failed")
		return
	}
	fileName := "expenses-" + time.Now().UTC().Format("20060102T150405Z") + "-" + jobID + ".dump.enc"
	finalPath := filepath.Join(s.config.BackupDir, fileName)
	size, checksum, err := encryptBackupFile(temporaryPath, finalPath, s.config.BackupEncryptionKey)
	if err != nil {
		_ = os.Remove(finalPath)
		_ = s.admin.FailBackup(ctx, jobID, "backup encryption failed")
		return
	}
	if err := s.admin.CompleteBackup(ctx, jobID, fileName, size, checksum); err != nil {
		_ = os.Remove(finalPath)
	}
}

func runPGDump(ctx context.Context, databaseURL, destination string) error {
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return err
	}
	database := strings.TrimPrefix(parsed.Path, "/")
	if database == "" {
		return errors.New("database name is missing")
	}
	args := []string{"--format=custom", "--no-owner", "--no-acl", "--file", destination, "--dbname", database}
	if parsed.Hostname() != "" {
		args = append(args, "--host", parsed.Hostname())
	}
	if parsed.Port() != "" {
		args = append(args, "--port", parsed.Port())
	}
	if parsed.User != nil && parsed.User.Username() != "" {
		args = append(args, "--username", parsed.User.Username())
	}
	command := exec.CommandContext(ctx, "pg_dump", args...)
	command.Env = append(os.Environ(), "PGCONNECT_TIMEOUT=10")
	if parsed.User != nil {
		if password, ok := parsed.User.Password(); ok {
			command.Env = append(command.Env, "PGPASSWORD="+password)
		}
	}
	if sslMode := parsed.Query().Get("sslmode"); sslMode != "" {
		command.Env = append(command.Env, "PGSSLMODE="+sslMode)
	}
	return command.Run()
}

func encryptBackupFile(source, destination, encodedKey string) (int64, string, error) {
	masterKey, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encodedKey))
	if err != nil || len(masterKey) != 32 {
		return 0, "", errors.New("backup key must be 32 base64-encoded bytes")
	}
	encKey := deriveBackupKey(masterKey, "encryption")
	macKey := deriveBackupKey(masterKey, "authentication")
	block, err := aes.NewCipher(encKey)
	if err != nil {
		return 0, "", err
	}
	iv := make([]byte, aes.BlockSize)
	if _, err := rand.Read(iv); err != nil {
		return 0, "", err
	}
	in, err := os.Open(source)
	if err != nil {
		return 0, "", err
	}
	defer in.Close()
	out, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return 0, "", err
	}
	ok := false
	defer func() {
		_ = out.Close()
		if !ok {
			_ = os.Remove(destination)
		}
	}()
	header := append([]byte(encryptedBackupMagic), iv...)
	mac := hmac.New(sha256.New, macKey)
	if _, err := out.Write(header); err != nil {
		return 0, "", err
	}
	_, _ = mac.Write(header)
	streamWriter := &cipher.StreamWriter{S: cipher.NewCTR(block, iv), W: io.MultiWriter(out, mac)}
	if _, err := io.Copy(streamWriter, in); err != nil {
		return 0, "", err
	}
	if _, err := out.Write(mac.Sum(nil)); err != nil {
		return 0, "", err
	}
	if err := out.Sync(); err != nil {
		return 0, "", err
	}
	if err := out.Close(); err != nil {
		return 0, "", err
	}
	ok = true
	file, err := os.Open(destination)
	if err != nil {
		return 0, "", err
	}
	defer file.Close()
	hash := sha256.New()
	size, err := io.Copy(hash, file)
	if err != nil {
		return 0, "", err
	}
	return size, hex.EncodeToString(hash.Sum(nil)), nil
}

func deriveBackupKey(master []byte, purpose string) []byte {
	mac := hmac.New(sha256.New, master)
	_, _ = io.WriteString(mac, "expenses-backup-"+purpose+"-v1")
	return mac.Sum(nil)
}
