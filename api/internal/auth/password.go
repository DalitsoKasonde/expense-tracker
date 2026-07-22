package auth

import (
	"errors"
	"unicode"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

func ValidatePassword(password string) error {
	length := utf8.RuneCountInString(password)
	if length < 8 {
		return errors.New("password must be at least 8 characters")
	}
	if len([]byte(password)) > 72 {
		return errors.New("password must be 72 bytes or fewer")
	}

	var hasLetter, hasNumber bool
	for _, character := range password {
		hasLetter = hasLetter || unicode.IsLetter(character)
		hasNumber = hasNumber || unicode.IsNumber(character)
	}
	if !hasLetter || !hasNumber {
		return errors.New("password must include a letter and a number")
	}
	return nil
}

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}

	return string(hash), nil
}

func CheckPassword(hash, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}
