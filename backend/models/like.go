// Package models contains data structures for the application's domain models.
package models

import (
	"time"
)

// Like represents a user's like on a post.
// The combination of UserID and PostID must be unique.
type Like struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null;uniqueIndex:idx_user_post" json:"user_id"`
	PostID    uint      `gorm:"not null;uniqueIndex:idx_user_post" json:"post_id"`
	CreatedAt time.Time `json:"created_at"`

	// Relationships
	User User `gorm:"foreignKey:UserID" json:"user"`
	Post Post `gorm:"foreignKey:PostID" json:"post"`
}
