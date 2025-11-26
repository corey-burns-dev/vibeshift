// Package config provides application configuration loading and management.
package config

import (
	"errors"
	"log"

	"github.com/spf13/viper"
)

// Config holds application configuration values loaded from file or environment variables.
type Config struct {
	JWTSecret  string `mapstructure:"JWT_SECRET"`
	Port       string `mapstructure:"PORT"`
	DBHost     string `mapstructure:"DB_HOST"`
	DBPort     string `mapstructure:"DB_PORT"`
	DBUser     string `mapstructure:"DB_USER"`
	DBPassword string `mapstructure:"DB_PASSWORD"`
	DBName     string `mapstructure:"DB_NAME"`
	RedisURL   string `mapstructure:"REDIS_URL"`
}

// LoadConfig loads application configuration from file and environment variables.
func LoadConfig() *Config {
	viper.AddConfigPath(".")
	viper.SetConfigName("config")
	viper.SetConfigType("yml")
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		var notFoundErr viper.ConfigFileNotFoundError
		if errors.As(err, &notFoundErr) {
			log.Println("Config file not found; using environment variables and defaults")
		} else {
			log.Fatalf("Error reading config file: %s", err)
		}
	}

	// Set default values
	viper.SetDefault("PORT", "8080")
	viper.SetDefault("DB_HOST", "localhost")
	viper.SetDefault("DB_PORT", "5432")
	viper.SetDefault("DB_USER", "user")
	viper.SetDefault("DB_PASSWORD", "password")
	viper.SetDefault("DB_NAME", "social_media")
	viper.SetDefault("REDIS_URL", "localhost:6379")
	viper.SetDefault("JWT_SECRET", "your-secret-key-change-in-production")

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		log.Fatalf("Unable to decode config into struct, %v", err)
	}

	return &config
}
