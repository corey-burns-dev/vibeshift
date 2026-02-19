package models

import "time"

// ChatroomBan stores room-scoped bans for moderation.
type ChatroomBan struct {
	ConversationID uint      `gorm:"primaryKey;autoIncrement:false" json:"conversation_id"`
	UserID         uint      `gorm:"primaryKey;autoIncrement:false" json:"user_id"`
	BannedByUserID uint      `gorm:"not null;index" json:"banned_by_user_id"`
	Reason         string    `gorm:"type:text;default:''" json:"reason"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`

	User         *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
	BannedByUser *User `gorm:"foreignKey:BannedByUserID" json:"banned_by_user,omitempty"`
}

// TableName specifies the table name for GORM.
func (ChatroomBan) TableName() string {
	return "chatroom_bans"
}
