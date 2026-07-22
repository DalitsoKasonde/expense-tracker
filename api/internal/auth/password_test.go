package auth

import "testing"

func TestValidatePassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{name: "valid", password: "chuma2026", wantErr: false},
		{name: "too short", password: "cash12", wantErr: true},
		{name: "missing number", password: "onlyletters", wantErr: true},
		{name: "missing letter", password: "12345678", wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if gotErr := ValidatePassword(test.password) != nil; gotErr != test.wantErr {
				t.Fatalf("ValidatePassword() error = %v, wantErr %v", gotErr, test.wantErr)
			}
		})
	}
}
