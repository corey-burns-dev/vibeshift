// Package models contains data structures for the application's domain models.
package models

import (
	"time"

	"gorm.io/gorm"
)

// User represents a user in the Vibeshift application.
type User struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Username  string         `gorm:"unique;not null" json:"username"`
	Email     string         `gorm:"unique;not null" json:"email"`
	Password  string         `gorm:"not null" json:"-"`
	Bio       string         `json:"bio"`
	Avatar    string         `json:"avatar"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	Posts     []Post         `gorm:"foreignKey:UserID" json:"posts,omitempty"`
}
