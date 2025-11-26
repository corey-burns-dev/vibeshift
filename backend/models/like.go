package models

import (
	"time"

	"gorm.io/gorm"
)

// Like represents a user's like on a post.
// The combination of UserID and PostID must be unique.
type Like struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"not null;uniqueIndex:idx_user_post" json:"user_id"`
	PostID    uint           `gorm:"not null;uniqueIndex:idx_user_post" json:"post_id"`
	CreatedAt time.Time      `json:"created_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	User User `gorm:"foreignKey:UserID" json:"user"`
	Post Post `gorm:"foreignKey:PostID" json:"post"`
}