package models

import (
	"time"

	"gorm.io/gorm"
)

type Post struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	Title    string `gorm:"not null" json:"title"`
	Content  string `gorm:"not null" json:"content"`
	ImageURL string `json:"image_url"`
	UserID   uint   `gorm:"not null" json:"user_id"`
	User     User   `gorm:"foreignKey:UserID" json:"user"`
	// LikesCount is not persisted; computed at query time
	LikesCount int `gorm:"-" json:"likes_count"`
	// CommentsCount is not persisted; computed at query time
	CommentsCount int `gorm:"-" json:"comments_count"`
	// Liked indicates whether the current requesting user liked this post (computed)
	Liked     bool           `gorm:"-" json:"liked"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
