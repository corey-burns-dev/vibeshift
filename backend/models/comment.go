// Package models contains data structures for the application's domain models.
package models

import (
	"time"

	"gorm.io/gorm"
)

// Comment represents a comment on a post in the Vibeshift application.
type Comment struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Content   string         `gorm:"not null" json:"content"`
	UserID    uint           `gorm:"not null" json:"user_id"`
	PostID    uint           `gorm:"not null" json:"post_id"`
	User      User           `gorm:"foreignKey:UserID" json:"user"`
	Post      Post           `gorm:"foreignKey:PostID" json:"post,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
