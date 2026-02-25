package validation

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestValidatePassword(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{"Valid", "SecurePass12!@", false},
		{"Exactly Min Length", "Abcdefghij1!", false},
		{"Exactly Max Length", "A" + strings.Repeat("b", 125) + "1!", false},
		{"Too Short", "Small1!", true},
		{"Too Long", "A" + strings.Repeat("b", 126) + "1!", true},
		{"No Upper", "securepass12!", true},
		{"No Lower", "SECUREPASS12!", true},
		{"No Digit", "SecurePass!!", true},
		{"No Special", "SecurePass123", true},
		{"Digits And Special Only", "1234567890!@", true},
		{"Unicode Characters", "ÅngstromPass12!", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePassword(tt.password)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestValidateUsername(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		username string
		wantErr  bool
	}{
		{"Valid", "test_user123", false},
		{"Too Short", "tu", true},
		{"Illegal Chars", "user@123", true},
		{"Starts Dash", "-user", true},
		{"Ends Underscore", "user_", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateUsername(tt.username)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestValidateEmail(t *testing.T) {
	t.Parallel()
	// 254 chars total: 64 local + @ + 185 domain label + ".com" (4)
	emailAt254 := strings.Repeat("a", 64) + "@" + strings.Repeat("b", 185) + ".com"
	tests := []struct {
		name    string
		email   string
		wantErr bool
	}{
		{"Valid", "test@example.com", false},
		{"Exactly 254 Characters", emailAt254, false},
		{"Invalid Format", "not-an-email", true},
		{"Missing Domain", "user@", true},
		{"Multiple At Symbols", "user@@example.com", true},
		{"Space In Local Part", "user @example.com", true},
		{"Trailing Dot In Domain", "user@example.com.", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateEmail(tt.email)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
