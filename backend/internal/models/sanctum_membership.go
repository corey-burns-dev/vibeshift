package models

import "time"

// SanctumMembershipRole defines a member's role in a sanctum.
type SanctumMembershipRole string

const (
	// SanctumMembershipRoleOwner is the sanctum owner role.
	SanctumMembershipRoleOwner SanctumMembershipRole = "owner"
	// SanctumMembershipRoleMod is the sanctum moderator role.
	SanctumMembershipRoleMod SanctumMembershipRole = "mod"
	// SanctumMembershipRoleMember is the default member role.
	SanctumMembershipRoleMember SanctumMembershipRole = "member"
)

// SanctumMembership maps users to sanctums and tracks role.
type SanctumMembership struct {
	SanctumID uint                  `gorm:"primaryKey;autoIncrement:false" json:"sanctum_id"`
	Sanctum   *Sanctum              `gorm:"foreignKey:SanctumID" json:"sanctum,omitempty"`
	UserID    uint                  `gorm:"primaryKey;autoIncrement:false" json:"user_id"`
	User      *User                 `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Role      SanctumMembershipRole `gorm:"type:varchar(20);not null;default:'member'" json:"role"`
	CreatedAt time.Time             `json:"created_at"`
	UpdatedAt time.Time             `json:"updated_at"`
}
