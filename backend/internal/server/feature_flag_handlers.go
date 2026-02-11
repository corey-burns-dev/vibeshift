package server

import "github.com/gofiber/fiber/v2"

// GetFeatureFlags returns configured feature flags and evaluated state for current user.
func (s *Server) GetFeatureFlags(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)

	if s.featureFlags == nil {
		return c.JSON(fiber.Map{
			"raw":       map[string]string{},
			"evaluated": map[string]bool{},
		})
	}

	return c.JSON(fiber.Map{
		"raw":       s.featureFlags.Raw(),
		"evaluated": s.featureFlags.Snapshot(userID),
	})
}
