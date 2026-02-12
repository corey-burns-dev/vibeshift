package cache

import (
	"context"
	"fmt"
	"time"
)

const (
	UserKeyPrefix        = "user:%d"
	PostKeyPrefix        = "post:%d"
	SanctumKeyPrefix     = "sanctum:%s"
	RoomKeyPrefix        = "room:%d"
	MessageHistoryPrefix = "room:%d:messages"
)

const (
	UserTTL           = 5 * time.Minute
	SanctumTTL        = 10 * time.Minute
	MessageHistoryTTL = 2 * time.Minute
	PostTTL           = 30 * time.Minute
)

func UserKey(userID uint) string {
	return fmt.Sprintf(UserKeyPrefix, userID)
}

func PostKey(postID uint) string {
	return fmt.Sprintf(PostKeyPrefix, postID)
}

func SanctumKey(slug string) string {
	return fmt.Sprintf(SanctumKeyPrefix, slug)
}

func RoomKey(roomID uint) string {
	return fmt.Sprintf(RoomKeyPrefix, roomID)
}

func MessageHistoryKey(roomID uint) string {
	return fmt.Sprintf(MessageHistoryPrefix, roomID)
}

func Invalidate(ctx context.Context, key string) {
	if client != nil {
		client.Del(ctx, key)
	}
}

func InvalidateUser(ctx context.Context, userID uint) {
	Invalidate(ctx, UserKey(userID))
}

func InvalidateRoom(ctx context.Context, roomID uint) {
	Invalidate(ctx, RoomKey(roomID))
	Invalidate(ctx, MessageHistoryKey(roomID))
}

func InvalidateSanctum(ctx context.Context, slug string) {
	Invalidate(ctx, SanctumKey(slug))
}
