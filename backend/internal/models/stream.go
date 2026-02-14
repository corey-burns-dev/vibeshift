// Package models contains data structures for the application's domain models.
package models

import (
	"time"
)

// Stream represents a live stream in the Sanctum application.
type Stream struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	UserID       uint       `gorm:"not null;index" json:"user_id"`
	User         User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Title        string     `gorm:"size:255;not null" json:"title"`
	Description  string     `gorm:"type:text" json:"description"`
	ThumbnailURL string     `gorm:"size:500" json:"thumbnail_url"`
	StreamURL    string     `gorm:"size:500" json:"stream_url"`
	StreamType   string     `gorm:"size:50" json:"stream_type"` // "youtube", "twitch", "hls", "iframe"
	IsLive       bool       `gorm:"default:false;index" json:"is_live"`
	ViewerCount  int        `gorm:"default:0" json:"viewer_count"`
	Category     string     `gorm:"size:100;index" json:"category"`
	Tags         string     `gorm:"type:text" json:"tags"` // JSON array of tags
	StartedAt    *time.Time `json:"started_at,omitempty"`
	EndedAt      *time.Time `json:"ended_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// StreamMessage represents a chat message in a stream.
type StreamMessage struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	StreamID  uint      `gorm:"not null;index" json:"stream_id"`
	UserID    uint      `gorm:"not null;index" json:"user_id"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// StreamCategories represents predefined stream categories.
var StreamCategories = []string{
	"Gaming",
	"Just Chatting",
	"Music",
	"Creative",
	"IRL",
	"Sports",
	"Education",
	"Talk Shows",
	"ASMR",
	"Food & Drink",
}
