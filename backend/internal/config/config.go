// Package config provides application configuration loading and management.
package config

import (
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/spf13/viper"
)

// Config holds application configuration values loaded from file or environment variables.
type Config struct {
	JWTSecret                     string  `mapstructure:"JWT_SECRET"`
	Port                          string  `mapstructure:"PORT"`
	DBHost                        string  `mapstructure:"DB_HOST"`
	DBPort                        string  `mapstructure:"DB_PORT"`
	DBUser                        string  `mapstructure:"DB_USER"`
	DBPassword                    string  `mapstructure:"DB_PASSWORD"`
	DBName                        string  `mapstructure:"DB_NAME"`
	DBSSLMode                     string  `mapstructure:"DB_SSLMODE"`
	DBReadHost                    string  `mapstructure:"DB_READ_HOST"`
	DBReadPort                    string  `mapstructure:"DB_READ_PORT"`
	DBReadUser                    string  `mapstructure:"DB_READ_USER"`
	DBReadPassword                string  `mapstructure:"DB_READ_PASSWORD"`
	RedisURL                      string  `mapstructure:"REDIS_URL"`
	AllowedOrigins                string  `mapstructure:"ALLOWED_ORIGINS"`
	FeatureFlags                  string  `mapstructure:"FEATURE_FLAGS"`
	Env                           string  `mapstructure:"APP_ENV"`
	DBSchemaMode                  string  `mapstructure:"DB_SCHEMA_MODE"`
	DBAutoMigrateAllowDestructive bool    `mapstructure:"DB_AUTOMIGRATE_ALLOW_DESTRUCTIVE"`
	ImageUploadDir                string  `mapstructure:"IMAGE_UPLOAD_DIR"`
	ImageMaxUploadSizeMB          int     `mapstructure:"IMAGE_MAX_UPLOAD_SIZE_MB"`
	TURNURL                       string  `mapstructure:"TURN_URL"`
	TURNUsername                  string  `mapstructure:"TURN_USERNAME"`
	TURNPassword                  string  `mapstructure:"TURN_PASSWORD"`
	DevBootstrapRoot              bool    `mapstructure:"DEV_BOOTSTRAP_ROOT"`
	DevRootUsername               string  `mapstructure:"DEV_ROOT_USERNAME"`
	DevRootEmail                  string  `mapstructure:"DEV_ROOT_EMAIL"`
	DevRootPassword               string  `mapstructure:"DEV_ROOT_PASSWORD"`
	DevRootForceCredentials       bool    `mapstructure:"DEV_ROOT_FORCE_CREDENTIALS"`
	DBMaxOpenConns                int     `mapstructure:"DB_MAX_OPEN_CONNS"`
	DBMaxIdleConns                int     `mapstructure:"DB_MAX_IDLE_CONNS"`
	DBConnMaxLifetimeMinutes      int     `mapstructure:"DB_CONN_MAX_LIFETIME_MINUTES"`
	TracingEnabled                bool    `mapstructure:"TRACING_ENABLED"`
	TracingExporter               string  `mapstructure:"TRACING_EXPORTER"`
	OTLPEndpoint                  string  `mapstructure:"OTEL_EXPORTER_OTLP_ENDPOINT"`
	OTELServiceName               string  `mapstructure:"OTEL_SERVICE_NAME"`
	OTELTracesSamplerRatio        float64 `mapstructure:"OTEL_TRACES_SAMPLER_RATIO"`
	EnableProxyHeader             bool    `mapstructure:"ENABLE_PROXY_HEADER"`
}

// LoadConfig loads application configuration from file and environment variables.
func LoadConfig() (*Config, error) {
	viper.AddConfigPath(".")
	viper.AddConfigPath("..")
	viper.AddConfigPath("../..")
	viper.SetConfigName("config")
	viper.SetConfigType("yml")
	viper.AutomaticEnv()

	// Initial read to get APP_ENV if set in base config
	// We intentionally ignore this error as the config file may not exist yet
	_ = viper.ReadInConfig()

	env := viper.GetString("APP_ENV")
	if env == "" {
		env = "development"
	}

	if env != "development" && env != "" {
		viper.SetConfigName("config." + env)
		if err := viper.MergeInConfig(); err != nil {
			return nil, fmt.Errorf("required profile-specific config 'config.%s.yml' not found: %w", env, err)
		}
		log.Printf("Loaded profile-specific configuration: config.%s.yml", env)
	}

	// Set default values for development
	viper.SetDefault("PORT", "8375")
	viper.SetDefault("DB_HOST", "localhost")
	viper.SetDefault("DB_PORT", "5432")
	viper.SetDefault("DB_USER", "user")
	viper.SetDefault("DB_PASSWORD", "password")
	viper.SetDefault("DB_NAME", "social_media")
	viper.SetDefault("DB_READ_HOST", "")
	viper.SetDefault("DB_READ_PORT", "5432")
	viper.SetDefault("DB_READ_USER", "user")
	viper.SetDefault("DB_READ_PASSWORD", "password")
	viper.SetDefault("REDIS_URL", "localhost:6379")
	viper.SetDefault("JWT_SECRET", "your-secret-key-change-in-production")
	viper.SetDefault("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173")
	viper.SetDefault("FEATURE_FLAGS", "")
	viper.SetDefault("APP_ENV", "development")
	viper.SetDefault("DB_SSLMODE", "disable")
	viper.SetDefault("DB_SCHEMA_MODE", "sql")
	viper.SetDefault("DB_AUTOMIGRATE_ALLOW_DESTRUCTIVE", false)
	viper.SetDefault("IMAGE_UPLOAD_DIR", "/tmp/sanctum/uploads/images")
	viper.SetDefault("IMAGE_MAX_UPLOAD_SIZE_MB", 10)
	viper.SetDefault("DEV_BOOTSTRAP_ROOT", true)
	viper.SetDefault("DEV_ROOT_USERNAME", "sanctum_root")
	viper.SetDefault("DEV_ROOT_EMAIL", "root@sanctum.local")
	viper.SetDefault("DEV_ROOT_PASSWORD", "DevRoot123!")
	viper.SetDefault("DEV_ROOT_FORCE_CREDENTIALS", true)
	viper.SetDefault("DB_MAX_OPEN_CONNS", 25)
	viper.SetDefault("DB_MAX_IDLE_CONNS", 5)
	viper.SetDefault("DB_CONN_MAX_LIFETIME_MINUTES", 5)
	viper.SetDefault("TRACING_ENABLED", false)
	viper.SetDefault("TRACING_EXPORTER", "stdout")
	viper.SetDefault("OTEL_EXPORTER_OTLP_ENDPOINT", "localhost:4318")
	viper.SetDefault("OTEL_SERVICE_NAME", "sanctum-api")
	viper.SetDefault("OTEL_TRACES_SAMPLER_RATIO", 1.0)
	viper.SetDefault("ENABLE_PROXY_HEADER", false)

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, fmt.Errorf("unable to decode config into struct: %w", err)
	}

	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return &config, nil
}

// Validate ensures that required configuration values are present and meet security standards.
func (c *Config) Validate() error {
	if c.Port == "" {
		return errors.New("PORT is required")
	}
	if c.JWTSecret == "" {
		return errors.New("JWT_SECRET is required")
	}
	if c.DBSchemaMode == "" {
		c.DBSchemaMode = "sql"
	}
	mode := strings.ToLower(strings.TrimSpace(c.DBSchemaMode))
	switch mode {
	case "hybrid", "sql", "auto":
	default:
		return fmt.Errorf("DB_SCHEMA_MODE must be one of hybrid|sql|auto, got %q", c.DBSchemaMode)
	}
	c.DBSchemaMode = mode
	if c.ImageUploadDir == "" {
		c.ImageUploadDir = "/tmp/sanctum/uploads/images"
	}
	if c.ImageMaxUploadSizeMB <= 0 {
		return errors.New("IMAGE_MAX_UPLOAD_SIZE_MB must be greater than 0")
	}

	if c.DBMaxOpenConns < 0 {
		return errors.New("DB_MAX_OPEN_CONNS must be >= 0")
	}
	if c.DBMaxIdleConns < 0 {
		return errors.New("DB_MAX_IDLE_CONNS must be >= 0")
	}
	if c.DBConnMaxLifetimeMinutes < 0 {
		return errors.New("DB_CONN_MAX_LIFETIME_MINUTES must be >= 0")
	}
	if c.DBMaxOpenConns > 0 && c.DBMaxIdleConns > c.DBMaxOpenConns {
		return errors.New("DB_MAX_IDLE_CONNS cannot be greater than DB_MAX_OPEN_CONNS")
	}

	isProduction := c.Env == "production" || c.Env == "prod"

	// DB SSL Mode normalization
	c.DBSSLMode = strings.ToLower(strings.TrimSpace(c.DBSSLMode))

	// Strict checks for production
	if isProduction {
		if c.DBConnMaxLifetimeMinutes < 1 {
			return errors.New("DB_CONN_MAX_LIFETIME_MINUTES must be >= 1 in production")
		}
		if c.JWTSecret == "your-secret-key-change-in-production" {
			return errors.New("JWT_SECRET must be changed from the default value in production")
		}
		if len(c.JWTSecret) < 32 {
			return errors.New("JWT_SECRET must be at least 32 characters in production")
		}
		if c.DBPassword == "password" || c.DBPassword == "" {
			return errors.New("a strong DB_PASSWORD is required in production")
		}
		/*
			if c.DBSSLMode == "disable" || c.DBSSLMode == "" {
				return errors.New("DB_SSLMODE must not be 'disable' or empty in production")
			}
		*/
		if c.AllowedOrigins == "*" {
			log.Println("WARNING: ALLOWED_ORIGINS is set to '*' in production. This is insecure.")
		}
		if c.RedisURL == "" {
			return errors.New("REDIS_URL is required in production (auth, rate limiting, and WebSocket features depend on it)")
		}
	} else if len(c.JWTSecret) < 32 {
		// Development/Test warnings
		log.Println("WARNING: JWT_SECRET is shorter than 32 characters. Consider using a stronger secret for production.")
	}

	return nil
}
