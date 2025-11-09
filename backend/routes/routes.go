package routes

import (
	"vibeshift/handlers"
	"vibeshift/middleware"

	"github.com/gofiber/fiber/v2"
)

func Setup(app *fiber.App) {
	api := app.Group("/api")

	// Health check (moved from main)
	api.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"message": "Vibecheck successful",
			"version": "1.0.0",
		})
	})

	// Auth routes
	auth := api.Group("/auth")
	auth.Post("/signup", handlers.Signup)
	auth.Post("/login", handlers.Login)

	// Post routes
	posts := api.Group("/posts")
	// Public post routes
	posts.Get("/", handlers.GetAllPosts)
	posts.Get("/search", handlers.SearchPosts)
	posts.Get("/:id", handlers.GetPost)
	posts.Post("/:id/like", handlers.LikePost)
	posts.Get("/:id/comments", handlers.GetComments)
	// Protected post routes
	posts.Post("/", middleware.AuthRequired, handlers.CreatePost)
	posts.Put("/:id", middleware.AuthRequired, handlers.UpdatePost)
	posts.Delete("/:id", middleware.AuthRequired, handlers.DeletePost)
	posts.Post("/:id/comments", middleware.AuthRequired, handlers.CreateComment)
	posts.Put("/:id/comments/:commentId", middleware.AuthRequired, handlers.UpdateComment)
	posts.Delete("/:id/comments/:commentId", middleware.AuthRequired, handlers.DeleteComment)

	// User routes
	users := api.Group("/users")
	// Public user routes (list all)
	users.Get("/", handlers.GetAllUsers)
	// Protected user routes (must come before /:id to avoid conflicts)
	users.Get("/me", middleware.AuthRequired, handlers.GetMyProfile)
	users.Put("/me", middleware.AuthRequired, handlers.UpdateMyProfile)
	// Public user routes (single user)
	users.Get("/:id", handlers.GetUserProfile)

	// Chat routes (all protected)
	chat := api.Group("/chat", middleware.AuthRequired)
	// Conversations
	chat.Get("/conversations", handlers.GetConversations)
	chat.Post("/conversations", handlers.CreateConversation)
	chat.Get("/conversations/:id", handlers.GetConversation)
	chat.Post("/conversations/:id/read", handlers.MarkAsRead)
	chat.Post("/conversations/:id/participants", handlers.AddParticipants)
	chat.Delete("/conversations/:id/participants/:participantId", handlers.RemoveParticipant)
	// Messages
	chat.Get("/conversations/:id/messages", handlers.GetMessages)
	chat.Post("/conversations/:id/messages", handlers.SendMessage)
	chat.Delete("/conversations/:id/messages/:messageId", handlers.DeleteMessage)
}
