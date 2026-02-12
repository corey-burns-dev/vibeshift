// Package config provides application configuration loading and management.
package config

import (
	"errors"
	"fmt"
	"log"

	"github.com/spf13/viper"
)

// Config holds application configuration values loaded from file or environment variables.
type Config struct {
	JWTSecret      string `mapstructure:"JWT_SECRET"`
	Port           string `mapstructure:"PORT"`
	DBHost         string `mapstructure:"DB_HOST"`
	DBPort         string `mapstructure:"DB_PORT"`
	DBUser         string `mapstructure:"DB_USER"`
	DBPassword     string `mapstructure:"DB_PASSWORD"`
	DBName         string `mapstructure:"DB_NAME"`
	DBSSLMode      string `mapstructure:"DB_SSLMODE"`
	DBReadHost     string `mapstructure:"DB_READ_HOST"`
	DBReadPort     string `mapstructure:"DB_READ_PORT"`
	DBReadUser     string `mapstructure:"DB_READ_USER"`
	DBReadPassword string `mapstructure:"DB_READ_PASSWORD"`
	RedisURL       string `mapstructure:"REDIS_URL"`
	AllowedOrigins string `mapstructure:"ALLOWED_ORIGINS"`
	FeatureFlags   string `mapstructure:"FEATURE_FLAGS"`
	Env            string `mapstructure:"APP_ENV"`
	TURNURL        string `mapstructure:"TURN_URL"`
	TURNUsername   string `mapstructure:"TURN_USERNAME"`
	TURNPassword   string `mapstructure:"TURN_PASSWORD"`
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

	isProduction := c.Env == "production" || c.Env == "prod"

	// Strict checks for production
	if isProduction {
		if c.JWTSecret == "your-secret-key-change-in-production" {
			return errors.New("JWT_SECRET must be changed from the default value in production")
		}
		if len(c.JWTSecret) < 32 {
			return errors.New("JWT_SECRET must be at least 32 characters in production")
		}
		if c.DBPassword == "password" || c.DBPassword == "" {
			return errors.New("a strong DB_PASSWORD is required in production")
		}
		if c.DBSSLMode == "disable" || c.DBSSLMode == "" {
			log.Println("WARNING: DB_SSLMODE is 'disable' in production. It is highly recommended to use SSL for database connections.")
		}
		if c.AllowedOrigins == "*" {
			log.Println("WARNING: ALLOWED_ORIGINS is set to '*' in production. This is insecure.")
		}
	} else {
		// Development/Test warnings
		if len(c.JWTSecret) < 32 {
			log.Println("WARNING: JWT_SECRET is shorter than 32 characters. Consider using a stronger secret for production.")
		}
	}

	return nil
}
