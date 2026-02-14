# Database Seeding

## Overview

This project includes a professional database seeding system to populate your
database with realistic test data. This follows industry best practices used by
companies like Stripe, GitHub, and others.

## Quick Start

```bash
# Seed the database with test data
make seed
```

This will create:

- **15 test users** with realistic profiles
- **30-60 posts** with varied content
- **50+ comments** on posts
- **Random likes** on posts
- All users have avatars from [DiceBear](https://dicebear.com/)

## Test Users

All seeded users have the same password for easy testing:

- **Password:** `password123`

Example users:

- `alex_dev@example.com`
- `sarah_codes@example.com`
- `mike_tech@example.com`
- `emma_design@example.com`
- ... and 11 more!

## What Gets Seeded?

### Users (15)

- Unique usernames and emails
- Professional bios
- Avatar images
- Bcrypt-hashed passwords

### Posts (30-60)

- 2-4 posts per user
- Realistic titles and content
- Random likes (0-49)
- 30% have image URLs
- Varied creation times

### Comments (50+)

- 1-5 comments per post
- Comments from different users
- Realistic comment text
- Natural conversation patterns

### Likes

- Random distribution across posts
- Realistic engagement patterns

## Advanced Usage

### Run Seeder Directly

```bash
cd backend
go run cmd/seed/main.go
```

You can also target category-accurate sanctum seeding:

```bash
cd backend
# Seed all built-in sanctums with 10 posts each (50% text,30%media,10%link,10%video)
go run cmd/seed/main.go -all-sanctums -count 10

# Seed a single sanctum by slug with 5 posts
go run cmd/seed/main.go -sanctum pc-gaming -count 5
```

Validate seed distribution (requires `psql` and `DATABASE_URL` env var):

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/sanctum scripts/validate_seed.sh
```

### Clear and Re-seed

The seeder automatically clears existing data before seeding. If you want to keep existing data, modify `backend/seed/seed.go`:

```go
// Comment out this line in the Seed function:
// if err := clearData(db); err != nil {
//     return fmt.Errorf("failed to clear data: %w", err)
// }
```

### Customize Seed Data

Edit `backend/seed/seed.go` to customize:

- Number of users
- Posts per user
- Comments per post
- User data (names, bios, etc.)
- Post content

## Best Practices Implemented

### 1. **Separate Seeder Command**

- Dedicated CLI tool (`cmd/seed/main.go`)
- Can run independently or via Makefile
- Clear output with status indicators

### 2. **Idempotent Seeding**

- Clears data before seeding
- Safe to run multiple times
- Predictable results

### 3. **Realistic Data**

- Actual user profiles with bios
- Varied content that looks real
- Natural relationships (comments from different users)
- Random but reasonable distributions

### 4. **Foreign Key Awareness**

- Deletes in correct order
- Respects relationships
- Prevents constraint violations

### 5. **Production-Ready Passwords**

- Uses bcrypt hashing
- Same as production auth
- Secure even in test environment

### 6. **Easy to Extend**

- Modular functions
- Easy to add new models
- Simple to customize data

## When to Use

### Development

```bash
# Start fresh every morning
make seed
```

### Testing

```bash
# Reset to known state before tests
make seed
go test ./...
```

### Demos

```bash
# Populate for client presentations
make seed
```

### CI/CD

```bash
# In your CI pipeline
docker-compose up -d postgres redis
make seed
make test
```

## Integration with Existing Data

If you have existing data you want to keep:

1. **Option 1: Skip clearing**
   - Comment out `clearData()` in `seed.go`
   - Seeder will add to existing data

2. **Option 2: Selective seeding**
   - Create custom seed functions
   - Call only what you need

3. **Option 3: Multiple seed files**
   - Create `seed_dev.go`, `seed_prod.go`
   - Use build tags to separate

## Environment-Specific Seeding

### Development (Current)

- 15 users, lots of content
- Clear data each time
- Fast and lightweight

### Staging (Future)

```go
// seed_staging.go
func SeedStaging(db *gorm.DB) {
    // 100 users
    // More realistic volumes
    // Don't clear data
}
```

### Production (Never)

- Don't seed production!
- Use migrations instead
- Real data only

## Troubleshooting

### "Failed to clear data"

- Check database connection
- Verify PostgreSQL is running
- Check foreign key constraints

### "Failed to create users"

- Unique constraint violation?
- Clear database manually
- Check existing data

### Slow seeding

- Normal for first run
- Bcrypt hashing takes time
- Reduce number of users if needed

## Future Enhancements

Planned improvements:

- [ ] Chat conversations seeding
- [ ] User relationships/followers
- [ ] More varied post types
- [ ] Time-based data (realistic timestamps)
- [ ] Factory pattern for more flexibility
- [ ] Faker library integration
- [ ] Admin user creation
- [ ] Seed profiles (small/medium/large)

## Related Commands

```bash
make dev              # Start development environment
make test-api         # Test with seeded data
make clean            # Remove all data
```

## Learn More

This seeding approach is inspired by:

- Rails database seeds
- Laravel seeders and factories
- Django fixtures
- Prisma seed scripts

Read more about best practices:

- [The Twelve-Factor App](https://12factor.net/)
- [Database Seeding Best Practices](https://guides.rubyonrails.org/v3.2/migrations.html#migrations-and-seed-data)
