// Command main runs the database seeder for Sanctum.
package main

import (
	"flag"
	"log"

	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/models"
	"sanctum/internal/seed"
)

func main() {
	// Parse command line flags
	numUsers := flag.Int("users", 50, "Number of users to create")
	numPosts := flag.Int("posts", 200, "Number of posts to create")
	shouldClean := flag.Bool("clean", true, "Clean database before seeding")
	preset := flag.String("preset", "", "Apply a specific seeder preset (e.g., MegaPopulated)")
	allSanctums := flag.Bool("all-sanctums", false, "Seed all built-in sanctums with category-accurate posts")
	sanctumSlug := flag.String("sanctum", "", "Seed a specific sanctum by slug with category-accurate posts")
	countPerSanctum := flag.Int("count", 10, "Number of posts per sanctum when seeding sanctums")
	countsFile := flag.String("counts-file", "", "Path to JSON file with per-sanctum exact counts")
	skipBcrypt := flag.Bool("skip-bcrypt", false, "Skip bcrypt hashing for faster dev seeding")
	dryRun := flag.Bool("dry-run", false, "Print planned seed actions without writing to DB")
	batchSize := flag.Int("batch-size", 0, "Batch size for bulk inserts (0 = disabled)")
	maxDays := flag.Int("max-days", 90, "Max days in the past to spread CreatedAt timestamps")
	flag.Parse()

	log.Println("🌱 Database Seeder")
	log.Println("==================")

	if *preset != "" {
		log.Printf("Applying preset: %s (ignoring other flags)\n", *preset)
	} else {
		log.Printf("Target: %d users, %d posts, clean=%v\n", *numUsers, *numPosts, *shouldClean)
	}

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Connect to database
	_, err = database.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Run seeder
	opts := seed.Options{
		SkipBcrypt: *skipBcrypt,
		DryRun:     *dryRun,
		BatchSize:  *batchSize,
		MaxDays:    *maxDays,
	}
	s := seed.NewSeeder(database.DB, opts)

	if *shouldClean {
		if err := s.ClearAll(); err != nil {
			log.Fatalf("❌ Cleanup failed: %v", err)
		}
	}

	if err := seed.Sanctums(database.DB); err != nil {
		log.Fatalf("❌ Built-in sanctum seeding failed: %v", err)
	}

	switch {
	case *preset != "":
		if err := s.ApplyPreset(*preset); err != nil {
			log.Fatalf("❌ Preset seeding failed: %v", err)
		}
	case *allSanctums || *sanctumSlug != "" || *countsFile != "":
		users, meshErr := s.SeedSocialMesh(*numUsers)
		if meshErr != nil {
			log.Fatalf("❌ Social mesh seeding failed: %v", meshErr)
		}

		switch {
		case *countsFile != "":
			countsMap, err := seed.ParseCountsFile(*countsFile)
			if err != nil {
				log.Fatalf("❌ Failed to parse counts file: %v", err)
			}
			var sanctums []*models.Sanctum
			if err := database.DB.Find(&sanctums).Error; err != nil {
				log.Fatalf("❌ Failed to find sanctums: %v", err)
			}
			for _, st := range sanctums {
				if entry, ok := countsMap[st.Slug]; ok {
					if err := s.SeedSanctumWithExactCounts(users, st, entry); err != nil {
						log.Fatalf("❌ Sanctum seeding failed for %s: %v", st.Slug, err)
					}
				}
			}
		case *allSanctums:
			if err := s.SeedSanctumsWithDistribution(users, *countPerSanctum); err != nil {
				log.Fatalf("❌ Sanctum seeding failed: %v", err)
			}
		case *sanctumSlug != "":
			var sanctums []*models.Sanctum
			if err := database.DB.Find(&sanctums, "slug = ?", *sanctumSlug).Error; err != nil {
				log.Fatalf("❌ Failed to find sanctum: %v", err)
			}
			if len(sanctums) == 0 {
				log.Fatalf("❌ No sanctum found with slug: %s", *sanctumSlug)
			}
			if err := s.SeedSanctumWithDistributionSingle(users, sanctums[0], *countPerSanctum); err != nil {
				log.Fatalf("❌ Sanctum seeding failed: %v", err)
			}
		}

		if _, err := s.SeedEngagement(users, *numPosts); err != nil {
			log.Fatalf("❌ Engagement seeding failed: %v", err)
		}
	default:
		// Default behavior: seed social mesh, category-aware sanctum posts, then global engagement.
		users, err := s.SeedSocialMesh(*numUsers)
		if err != nil {
			log.Fatalf("❌ Social mesh seeding failed: %v", err)
		}
		if err := s.SeedSanctumsWithDistribution(users, *countPerSanctum); err != nil {
			log.Fatalf("❌ Sanctum seeding failed: %v", err)
		}
		if _, err := s.SeedEngagement(users, *numPosts); err != nil {
			log.Fatalf("❌ Engagement seeding failed: %v", err)
		}
	}

	log.Println("✨ All done! Your database is now populated with test data.")
	log.Println("📧 All test users have the password: password123")
}
