// Package models contains data structures for the application's domain models.
package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// Conversation represents a chat conversation (can be 1-on-1 or group)
type Conversation struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Name         string         `json:"name"` // For group chats
	IsGroup      bool           `gorm:"default:false" json:"is_group"`
	Avatar       string         `json:"avatar"` // For group chats
	CreatedBy    uint           `json:"created_by"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
	Participants []User         `gorm:"many2many:conversation_participants;" json:"participants,omitempty"`
	Messages     []Message      `gorm:"foreignKey:ConversationID" json:"messages,omitempty"`
	UnreadCount  int            `gorm:"-" json:"unread_count"`
}

// Message represents a chat message
type Message struct {
	ID             uint            `gorm:"primaryKey" json:"id"`
	ConversationID uint            `gorm:"not null;index" json:"conversation_id"`
	Conversation   *Conversation   `gorm:"foreignKey:ConversationID" json:"conversation,omitempty"`
	SenderID       uint            `gorm:"not null;index" json:"sender_id"`
	Sender         *User           `gorm:"foreignKey:SenderID" json:"sender,omitempty"`
	Content        string          `gorm:"type:text;not null" json:"content"`
	MessageType    string          `gorm:"default:'text'" json:"message_type"`  // text, image, file, etc.
	Metadata       json.RawMessage `gorm:"type:json" json:"metadata,omitempty"` // For file URLs, image URLs, etc.
	IsRead         bool            `gorm:"default:false" json:"is_read"`
	ReadAt         *time.Time      `json:"read_at,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
	DeletedAt      gorm.DeletedAt  `gorm:"index" json:"-"`
}

// ConversationParticipant tracks user participation in conversations
// This is the join table that GORM will use for the many2many relationship
type ConversationParticipant struct {
	ConversationID uint      `gorm:"primaryKey" json:"conversation_id"`
	UserID         uint      `gorm:"primaryKey" json:"user_id"`
	JoinedAt       time.Time `gorm:"autoCreateTime" json:"joined_at"`
	LastReadAt     time.Time `json:"last_read_at"`
	UnreadCount    int       `gorm:"default:0" json:"unread_count"`
}
