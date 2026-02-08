// Package seed provides database seeding utilities for development and testing.
package seed

import (
	"fmt"
	"log"
	"math/rand"
	"strings"
	"time"
	"sanctum/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Options configuration for the seeder
type Options struct {
	NumUsers    int
	NumPosts    int
	ShouldClean bool
}

var (
	conversationNames = []string{
		"General", "Movies", "Music", "Television", "Gaming",
		"Fitness", "Hobbies", "Sports", "Technology",
		"Anime", "Books", "Food", "Travel", "Programming", "Linux", "Frontend", "Backend", "DevOps", "Cloud", "AI", "Startups", "Homelab", "Art", "History", "Philosophy", "Science",
		"Pets", "Parenting", "Relationships", "Social", "Finance", "Investing", "Crypto",
	}

	firstNames = []string{
		"James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
		"William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
		"Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
		"Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley",
		"Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
		"Kenneth", "Dorothy", "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa",
		"Edward", "Deborah", "Ronald", "Stephanie", "Timothy", "Rebecca", "Jason", "Sharon",
		"Jeffrey", "Laura", "Ryan", "Cynthia", "Jacob", "Kathleen", "Gary", "Amy",
		"Nicholas", "Shirley", "Eric", "Angela", "Jonathan", "Helen", "Stephen", "Anna",
		"Larry", "Brenda", "Justin", "Pamela", "Scott", "Nicole", "Brandon", "Emma",
		"Benjamin", "Samantha", "Samuel", "Katherine", "Gregory", "Christine", "Frank", "Debra",
		"Alexander", "Rachel", "Raymond", "Catherine", "Patrick", "Carolyn", "Jack", "Janet",
		"Dennis", "Ruth", "Jerry", "Maria", "Tyler", "Heather", "Aaron", "Diane",
		"Jose", "Virginia", "Adam", "Julie", "Henry", "Joyce", "Nathan", "Victoria",
		"Douglas", "Olivia", "Zachary", "Kelly", "Peter", "Christina", "Kyle", "Lauren",
		"Walter", "Joan", "Ethan", "Evelyn", "Jeremy", "Judith", "Harold", "Megan",
	}

	lastNames = []string{
		"Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
		"Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
		"Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
		"Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young",
		"Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
		"Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
		"Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker",
		"Cruz", "Edwards", "Collins", "Reyes", "Stewart", "Morris", "Morales", "Murphy",
		"Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper", "Peterson", "Bailey",
		"Reed", "Kelly", "Howard", "Ramos", "Kim", "Cox", "Ward", "Richardson",
		"Watson", "Brooks", "Chavez", "Wood", "James", "Bennett", "Gray", "Mendoza",
		"Ruiz", "Hughes", "Price", "Alvarez", "Castillo", "Sanders", "Patel", "Myers",
		"Long", "Ross", "Foster", "Jimenez", "Powell", "Jenkins", "Perry", "Russell",
		"Sullivan", "Bell", "Coleman", "Butler", "Henderson", "Barnes", "Gonzales", "Fisher",
		"Vasquez", "Simmons", "Romero", "Jordan", "Patterson", "Alexander", "Hamilton", "Graham",
		"Reynolds", "Griffin", "Wallace", "Moreno", "West", "Cole", "Hayes", "Bryant",
	}

	adjectives = []string{
		"amazing", "incredible", "fascinating", "challenging", "excited", "happy", "proud",
		"grateful", "inspired", "motivated", "curious", "passionate", "creative", "innovative",
		"collaborative", "productive", "efficient", "effective", "powerful", "simple", "complex",
		"beautiful", "elegant", "robust", "scalable", "secure", "fast", "reliable", "dynamic",
		"intense", "focused", "driven", "ambitious", "humble", "thoughtful", "kind",
	}

	nouns = []string{
		"project", "team", "community", "code", "design", "architecture", "system", "app",
		"website", "platform", "framework", "library", "tool", "solution", "idea", "concept",
		"challenge", "opportunity", "goal", "dream", "journey", "experience", "lesson", "skill",
		"technology", "innovation", "future", "world", "life", "work", "passion", "hobby",
	}

	verbs = []string{
		"built", "created", "designed", "developed", "launched", "deployed", "shipped",
		"fixed", "solved", "learned", "discovered", "explored", "mastered", "shared",
		"wrote", "read", "watched", "listened", "played", "enjoyed", "loved", "hated",
		"improved", "optimized", "refactored", "debugged", "tested", "validated",
	}
)

// Seed populates the database with test data
func Seed(db *gorm.DB, opts Options) error {
	log.Printf("🌱 Starting database seeding with %d users and %d posts...", opts.NumUsers, opts.NumPosts)

	// Clear existing data to avoid conflicts if requested
	if opts.ShouldClean {
		if err := clearData(db); err != nil {
			log.Println("⚠️  Warning: Could not clear all existing data, but continuing anyway...")
		}
	}

	// Create test users
	users, err := createUsers(db, opts.NumUsers)
	if err != nil {
		return fmt.Errorf("failed to create users: %w", err)
	}
	log.Printf("✓ %d test users created", len(users))

	// Create conversations (chat rooms)
	conversations, err := createOrGetConversations(db)
	if err != nil {
		return fmt.Errorf("failed to create conversations: %w", err)
	}
	log.Printf("✓ %d conversations available", len(conversations))

	// Create posts for users
	posts, err := createPosts(db, users, opts.NumPosts)
	if err != nil {
		return fmt.Errorf("failed to create posts: %w", err)
	}
	log.Printf("✓ %d posts created", len(posts))

	// Chatroom membership is user-driven — seed users should NOT auto-join rooms
	_ = conversations // rooms exist, users join manually via the UI

	log.Println("🎉 Database seeding completed successfully!")
	return nil
}

func clearData(db *gorm.DB) error {
	log.Println("🗑️  Clearing existing data...")
	sql := `TRUNCATE TABLE comments, likes, posts, conversation_participants, messages, conversations, users RESTART IDENTITY CASCADE;`
	return db.Exec(sql).Error
}

func generateRandomName() (string, string) {
	//nolint:gosec // Weak random number generator is fine for seeding
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	first := firstNames[r.Intn(len(firstNames))]
	last := lastNames[r.Intn(len(lastNames))]
	return first, last
}

func generateUsername(first, last string) string {
	//nolint:gosec // Weak random number generator is fine for seeding
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	formats := []string{"%s%s", "%s.%s", "%s_%s", "%s%d", "%s_%d"}
	format := formats[r.Intn(len(formats))]

	switch format {
	case "%s%d", "%s_%d":
		return strings.ToLower(fmt.Sprintf(format, first, r.Intn(1000)))
	default:
		return strings.ToLower(fmt.Sprintf(format, first, last))
	}
}

func generateSentence() string {
	//nolint:gosec // Weak random number generator is fine for seeding
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	adj := adjectives[r.Intn(len(adjectives))]
	noun := nouns[r.Intn(len(nouns))]
	verb := verbs[r.Intn(len(verbs))]

	templates := []string{
		"Just %s an %s %s.",
		"The %s %s was %s.",
		"I %s this %s %s!",
		"What an %s %s to %s.",
		"Time to %s the %s %s.",
	}

	template := templates[r.Intn(len(templates))]
	return fmt.Sprintf(template, verb, adj, noun)
}

func generateParagraph(sentences int) string {
	var sb strings.Builder
	for i := 0; i < sentences; i++ {
		sb.WriteString(generateSentence())
		sb.WriteString(" ")
	}
	return strings.TrimSpace(sb.String())
}

func createUsers(db *gorm.DB, count int) ([]models.User, error) {
	users := make([]models.User, 0, count)
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

	// Always include some specific users for consistency if cleaning
	if count >= 3 {
		baseUsers := []string{"corey", "cburns", "test"}
		for _, u := range baseUsers {
			user := models.User{
				Username: u,
				Email:    fmt.Sprintf("%s@example.com", u),
				Password: string(hashedPassword),
				Bio:      "One of the OGs.",
				Avatar:   fmt.Sprintf("https://i.pravatar.cc/150?u=%s", u),
			}
			if err := db.Create(&user).Error; err == nil {
				users = append(users, user)
			}
		}
	}

	for i := len(users); i < count; i++ {
		first, last := generateRandomName()
		username := generateUsername(first, last)

		// Ensure uniqueness roughly
		username = fmt.Sprintf("%s%d", username, i)

		user := models.User{
			Username: username,
			Email:    fmt.Sprintf("%s@example.com", username),
			Password: string(hashedPassword),
			Bio:      generateSentence(),
			Avatar:   fmt.Sprintf("https://i.pravatar.cc/150?u=%s", username),
		}

		// Use batch insert in chunks for performance later, but simple loop fine for <10k
		if err := db.Create(&user).Error; err != nil {
			log.Printf("Failed to create user %s: %v", username, err)
			continue
		}
		users = append(users, user)

		if i%100 == 0 {
			log.Printf("Created %d users...", i)
		}
	}

	return users, nil
}

func createPosts(db *gorm.DB, users []models.User, count int) ([]models.Post, error) {
	//nolint:gosec // Weak random number generator is fine for seeding
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	posts := make([]models.Post, 0, count)

	for i := 0; i < count; i++ {
		user := users[r.Intn(len(users))]

		hasImage := r.Float32() < 0.4
		var imageURL string
		if hasImage {
			// Picsum allows id based access for stability, or random
			// Using random seed to get variety
			imageURL = fmt.Sprintf("https://picsum.photos/seed/%d/800/800", r.Intn(10000))
		}

		contentLen := r.Intn(20) + 1 // 1 to 20 sentences

		post := models.Post{
			Title: func() string {
				s := generateSentence()
				if s == "" {
					return ""
				}
				return strings.ToUpper(string(s[0])) + s[1:]
			}(),
			Content:       generateParagraph(contentLen),
			UserID:        user.ID,
			ImageURL:      imageURL,
			LikesCount:    r.Intn(1000), // Pre-populate some likes count (even if actual likes table isn't filled 1:1 for speed)
			CommentsCount: r.Intn(50),
		}

		if err := db.Create(&post).Error; err != nil {
			return nil, err
		}
		posts = append(posts, post)

		if i%100 == 0 {
			log.Printf("Created %d posts...", i)
		}
	}

	return posts, nil
}

func createOrGetConversations(db *gorm.DB) ([]models.Conversation, error) {
	conversations := make([]models.Conversation, 0, len(conversationNames))

	for _, name := range conversationNames {
		var conv models.Conversation
		// Use FirstOrCreate logic
		// avatar uses pravatar now too, or just dicebear for icons
		avatar := fmt.Sprintf("https://i.pravatar.cc/150?u=%s", name)

		err := db.Where(models.Conversation{Name: name, IsGroup: true}).
			Attrs(models.Conversation{Avatar: avatar}).
			FirstOrCreate(&conv).Error

		if err != nil {
			return nil, err
		}
		conversations = append(conversations, conv)
	}
	return conversations, nil
}
