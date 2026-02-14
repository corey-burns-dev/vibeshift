package config

import (
	"os"
	"testing"

	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
)

func TestConfig_ValidateSSLMode(t *testing.T) {
	tests := []struct {
		name        string
		env         string
		sslMode     string
		expectError bool
	}{
		{"Production with empty SSL mode", "production", "", true},
		{"Production with disable SSL mode", "production", "disable", true},
		{"Production with require SSL mode", "production", "require", false},
		{"Prod with empty SSL mode", "prod", "", true},
		{"Prod with disable SSL mode", "prod", "disable", true},
		{"Prod with verify-full SSL mode", "prod", "verify-full", false},
		{"Development with disable SSL mode", "development", "disable", false},
		{"Test with empty SSL mode", "test", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := &Config{
				Env:                      tt.env,
				DBSSLMode:                tt.sslMode,
				JWTSecret:                "secure-secret-at-least-32-chars-long",
				DBPassword:               "secure-password",
				Port:                     "8080",
				ImageMaxUploadSizeMB:     10,
				DBConnMaxLifetimeMinutes: 1,
				RedisURL:                 "redis://localhost:6379",
			}

			err := c.Validate()
			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestLoadConfig_SSLModeNormalization(t *testing.T) {
	// Clean up environment variables and viper after test
	defer os.Unsetenv("APP_ENV")
	defer os.Unsetenv("DB_SSLMODE")
	defer viper.Reset()

	os.Setenv("APP_ENV", "development")
	os.Setenv("DB_SSLMODE", "  DISABLE  ")

	// Since LoadConfig reads from files, we might need a more controlled way
	// to test normalization if it doesn't pick up environment variables easily
	// with default setup. But viper.AutomaticEnv() is called in LoadConfig.

	c, err := LoadConfig()
	assert.NoError(t, err)
	assert.Equal(t, "disable", c.DBSSLMode)
}
