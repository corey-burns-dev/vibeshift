package seed

import (
	"fmt"
	"log"
	"math/rand"
	"time"
	"vibeshift/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	usernames = []string{
		"alex_dev", "sarah_codes", "mike_tech", "emma_design", "john_backend",
		"lisa_frontend", "david_ops", "rachel_data", "chris_mobile", "jen_fullstack",
		"tom_cloud", "amy_security", "paul_devops", "maria_ai", "steve_lead",
	}

	bios = []string{
		"Full-stack developer passionate about clean code and great UX 🚀",
		"Building scalable systems one commit at a time ⚡",
		"Coffee, code, and more coffee ☕ | Open source enthusiast",
		"Love solving complex problems with simple solutions 💡",
		"Senior developer | Tech blogger | Mentor 🎯",
		"Cloud architecture & microservices expert ☁️",
		"UI/UX obsessed frontend developer 🎨",
		"Data engineer by day, gamer by night 🎮",
		"Turning ideas into reality through code 💻",
		"Always learning, always growing 🌱 | Tech speaker",
		"DevOps wizard | Automation enthusiast 🤖",
		"Security first, everything else second 🔒",
		"Mobile app developer | iOS & Android 📱",
		"AI/ML researcher | Python lover 🐍",
		"Team lead | Code reviewer | Mentor 👨‍💻",
	}

	postTitles = []string{
		"Just deployed my first microservice architecture!",
		"The importance of code reviews in team development",
		"How I improved our app's performance by 10x",
		"My journey from junior to senior developer",
		"Best practices for REST API design",
		"Understanding Docker containers in 5 minutes",
		"Why I switched from React to Vue (and back)",
		"Building a real-time chat application",
		"The future of web development in 2025",
		"How to write clean, maintainable code",
		"My favorite VS Code extensions for productivity",
		"Debugging tips that saved me hours",
		"Understanding async/await in JavaScript",
		"Why TypeScript is a game-changer",
		"Building scalable systems with Go",
		"The art of writing good commit messages",
		"How I landed my dream developer job",
		"Test-driven development: pros and cons",
		"My morning routine as a developer",
		"The tools I use every day as a developer",
	}

	postContents = []string{
		"After months of planning, I finally deployed our new microservice architecture to production. The performance improvements are incredible! Here's what I learned along the way...",
		"Code reviews are one of the most valuable practices in software development. They help catch bugs, improve code quality, and facilitate knowledge sharing across the team.",
		"We were facing serious performance issues with our application. After profiling and optimization, we achieved a 10x improvement. Here are the key changes we made...",
		"Reflecting on my 5-year journey from writing my first 'Hello World' to leading a development team. It's been an amazing ride with lots of lessons learned.",
		"REST APIs are the backbone of modern web applications. Here are my top 10 best practices for designing clean, scalable, and maintainable APIs.",
		"Docker has revolutionized the way we deploy applications. If you're new to containers, this guide will help you understand the basics quickly.",
		"I experimented with different frameworks over the years. Each has its strengths, but here's why I made my choices and what I learned.",
		"Built a production-ready real-time chat app using WebSockets. Here's the architecture and challenges I faced along the way.",
		"Web development is evolving rapidly. AI-assisted coding, edge computing, and new frameworks are changing how we build applications.",
		"Clean code isn't just about making it work—it's about making it maintainable. Here are the principles I follow every day.",
		"Extensions that have significantly improved my productivity: GitLens, Prettier, ESLint, and more. What are your favorites?",
		"Debugging can be frustrating, but with the right approach, you can save hours. Here are my go-to techniques when I'm stuck.",
		"Asynchronous programming in JavaScript can be tricky. Let me break down async/await with practical examples.",
		"TypeScript adds type safety to JavaScript and catches bugs before runtime. Here's why every project should consider using it.",
		"Go's simplicity and performance make it perfect for building scalable backend systems. Here's what makes it special.",
		"Good commit messages are documentation for your future self. Here's how I write commits that actually help the team.",
		"The interview process was tough, but preparation paid off. Here are the resources and strategies that helped me succeed.",
		"TDD has changed how I write code. It's not just about testing—it's about better design. But it's not without trade-offs.",
		"Starting the day right sets the tone for productivity. Coffee, quick standup, and focused work blocks work best for me.",
		"My essential toolkit: VS Code, Docker, Postman, Git, and more. These tools make my daily workflow smooth and efficient.",
	}

	comments = []string{
		"Great post! This really helped me understand the concept better.",
		"Thanks for sharing! I'll definitely try this approach.",
		"Interesting perspective. I've had similar experiences.",
		"This is exactly what I was looking for!",
		"Well explained! Bookmarking this for later reference.",
		"I disagree with some points, but overall solid advice.",
		"Can you elaborate more on the implementation details?",
		"This saved me so much time. Thank you!",
		"Great article! Looking forward to more content like this.",
		"I had the same issue and solved it differently, but your approach is better.",
		"Mind blown! 🤯 Never thought about it this way.",
		"Could you share the code repository?",
		"This is gold! Sharing with my team.",
		"I tried this and it worked perfectly. Thanks!",
		"One of the best explanations I've seen on this topic.",
	}
)

// Seed populates the database with test data
func Seed(db *gorm.DB) error {
	log.Println("🌱 Starting database seeding...")

	// Clear existing data (optional - comment out if you want to keep existing data)
	if err := clearData(db); err != nil {
		return fmt.Errorf("failed to clear data: %w", err)
	}

	// Create users
	users, err := createUsers(db)
	if err != nil {
		return fmt.Errorf("failed to create users: %w", err)
	}
	log.Printf("✓ Created %d users", len(users))

	// Create posts
	posts, err := createPosts(db, users)
	if err != nil {
		return fmt.Errorf("failed to create posts: %w", err)
	}
	log.Printf("✓ Created %d posts", len(posts))

	// Create comments
	commentsCount, err := createComments(db, users, posts)
	if err != nil {
		return fmt.Errorf("failed to create comments: %w", err)
	}
	log.Printf("✓ Created %d comments", commentsCount)

	// Add some likes to posts
	likesCount, err := addLikes(db, users, posts)
	if err != nil {
		return fmt.Errorf("failed to add likes: %w", err)
	}
	log.Printf("✓ Added %d likes", likesCount)

	log.Println("🎉 Database seeding completed successfully!")
	return nil
}

func clearData(db *gorm.DB) error {
	log.Println("🗑️  Clearing existing data...")

	// Delete in correct order to respect foreign key constraints
	if err := db.Exec("DELETE FROM comments").Error; err != nil {
		return err
	}
	if err := db.Exec("DELETE FROM likes").Error; err != nil {
		return err
	}
	if err := db.Exec("DELETE FROM posts").Error; err != nil {
		return err
	}
	if err := db.Exec("DELETE FROM conversation_participants").Error; err != nil {
		return err
	}
	if err := db.Exec("DELETE FROM messages").Error; err != nil {
		return err
	}
	if err := db.Exec("DELETE FROM conversations").Error; err != nil {
		return err
	}
	if err := db.Exec("DELETE FROM users").Error; err != nil {
		return err
	}

	return nil
}

func createUsers(db *gorm.DB) ([]models.User, error) {
	users := make([]models.User, 0, len(usernames))
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

	for i, username := range usernames {
		user := models.User{
			Username: username,
			Email:    fmt.Sprintf("%s@example.com", username),
			Password: string(hashedPassword),
			Bio:      bios[i],
			Avatar:   fmt.Sprintf("https://api.dicebear.com/7.x/avataaars/svg?seed=%s", username),
		}

		if err := db.Create(&user).Error; err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	return users, nil
}

func createPosts(db *gorm.DB, users []models.User) ([]models.Post, error) {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	// Create a slice to hold all post data before inserting
	type postData struct {
		title    string
		content  string
		userID   uint
		imageURL string
	}

	allPostsData := make([]postData, 0)

	// Prepare all posts data (each user creates 2-4 posts)
	for _, user := range users {
		numPosts := r.Intn(3) + 2 // 2-4 posts per user

		for i := 0; i < numPosts; i++ {
			titleIdx := r.Intn(len(postTitles))
			contentIdx := r.Intn(len(postContents))

			pd := postData{
				title:   postTitles[titleIdx],
				content: postContents[contentIdx],
				userID:  user.ID,
			}

			// Randomly add image URLs to some posts (30% chance)
			if r.Float32() < 0.3 {
				pd.imageURL = fmt.Sprintf("https://picsum.photos/seed/%d/800/600", r.Intn(1000))
			}

			allPostsData = append(allPostsData, pd)
		}
	}

	// Shuffle the posts so they're not grouped by user
	r.Shuffle(len(allPostsData), func(i, j int) {
		allPostsData[i], allPostsData[j] = allPostsData[j], allPostsData[i]
	})

	// Now create the posts in the shuffled order
	posts := make([]models.Post, 0, len(allPostsData))
	for _, pd := range allPostsData {
		post := models.Post{
			Title:    pd.title,
			Content:  pd.content,
			UserID:   pd.userID,
			ImageURL: pd.imageURL,
		}

		if err := db.Create(&post).Error; err != nil {
			return nil, err
		}
		posts = append(posts, post)

		// Add a small random delay to create more realistic timestamps
		time.Sleep(time.Millisecond * time.Duration(r.Intn(100)))
	}

	return posts, nil
}

func createComments(db *gorm.DB, users []models.User, posts []models.Post) (int, error) {
	count := 0
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	// Each post gets 1-5 comments
	for _, post := range posts {
		numComments := r.Intn(5) + 1

		for i := 0; i < numComments; i++ {
			// Pick a random user (different from post author when possible)
			userIdx := r.Intn(len(users))
			if len(users) > 1 && users[userIdx].ID == post.UserID {
				userIdx = (userIdx + 1) % len(users)
			}

			commentIdx := r.Intn(len(comments))
			comment := models.Comment{
				Content: comments[commentIdx],
				PostID:  post.ID,
				UserID:  users[userIdx].ID,
			}

			if err := db.Create(&comment).Error; err != nil {
				return count, err
			}
			count++
		}
	}

	return count, nil
}

func addLikes(db *gorm.DB, users []models.User, posts []models.Post) (int, error) {
	count := 0
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	if len(users) == 0 {
		return 0, nil
	}

	for _, post := range posts {
		// Each post gets a random number of likes, from 0 to all users
		numLikes := r.Intn(len(users) + 1)
		
		// Shuffle users to get a random subset
		shuffledUsers := make([]models.User, len(users))
		copy(shuffledUsers, users)
		r.Shuffle(len(shuffledUsers), func(i, j int) {
			shuffledUsers[i], shuffledUsers[j] = shuffledUsers[j], shuffledUsers[i]
		})

		for i := 0; i < numLikes; i++ {
			user := shuffledUsers[i]

			// A user cannot like their own post in this seed logic
			if user.ID == post.UserID {
				continue
			}

			like := models.Like{
				UserID: user.ID,
				PostID: post.ID,
			}

			// Use FirstOrCreate to avoid creating duplicate likes if we ever rerun this
			// on existing data. In this script, it's just for safety.
			if err := db.Where(models.Like{UserID: user.ID, PostID: post.ID}).FirstOrCreate(&like).Error; err != nil {
				// We can log the error but continue, as a duplicate like isn't a fatal seed error
				log.Printf("Could not create like for user %d on post %d: %v", user.ID, post.ID, err)
				continue
			}
			count++
		}
	}

	return count, nil
}
