package httpapi

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
)

func TestEncryptBackupFileRoundTrip(t *testing.T) {
	directory := t.TempDir()
	source := filepath.Join(directory, "database.dump")
	destination := filepath.Join(directory, "database.dump.enc")
	plaintext := []byte("private database backup content")
	if err := os.WriteFile(source, plaintext, 0600); err != nil {
		t.Fatal(err)
	}
	masterKey := bytes.Repeat([]byte{0x42}, 32)
	size, checksum, err := encryptBackupFile(source, destination, base64.StdEncoding.EncodeToString(masterKey))
	if err != nil {
		t.Fatal(err)
	}
	encrypted, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if size != int64(len(encrypted)) || checksum == "" || bytes.Contains(encrypted, plaintext) {
		t.Fatalf("unexpected encrypted artifact metadata or plaintext leakage")
	}

	headerSize := len(encryptedBackupMagic) + aes.BlockSize
	if len(encrypted) <= headerSize+sha256.Size || string(encrypted[:len(encryptedBackupMagic)]) != encryptedBackupMagic {
		t.Fatal("encrypted backup has an invalid envelope")
	}
	header := encrypted[:headerSize]
	ciphertext := encrypted[headerSize : len(encrypted)-sha256.Size]
	tag := encrypted[len(encrypted)-sha256.Size:]
	mac := hmac.New(sha256.New, deriveBackupKey(masterKey, "authentication"))
	_, _ = mac.Write(header)
	_, _ = mac.Write(ciphertext)
	if !hmac.Equal(tag, mac.Sum(nil)) {
		t.Fatal("encrypted backup authentication failed")
	}
	block, err := aes.NewCipher(deriveBackupKey(masterKey, "encryption"))
	if err != nil {
		t.Fatal(err)
	}
	restored := make([]byte, len(ciphertext))
	cipher.NewCTR(block, header[len(encryptedBackupMagic):]).XORKeyStream(restored, ciphertext)
	if !bytes.Equal(restored, plaintext) {
		t.Fatalf("restored content differs: %q", restored)
	}
}

func TestEncryptBackupFileRejectsInvalidKey(t *testing.T) {
	directory := t.TempDir()
	source := filepath.Join(directory, "database.dump")
	if err := os.WriteFile(source, []byte("backup"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := encryptBackupFile(source, filepath.Join(directory, "out.enc"), "not-a-valid-key"); err == nil {
		t.Fatal("expected an invalid backup key to be rejected")
	}
}
