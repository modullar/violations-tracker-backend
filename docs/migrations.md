# Database Migrations

This project uses the `migrate-mongo` framework to handle database migrations. This tool allows us to:

1. Keep track of which migrations have been run
2. Run new migrations automatically
3. Roll back migrations if needed (when possible)

## How It Works

- Migrations are stored in the `migrations/` directory
- Each migration has unique timestamp in its filename
- `migrate-mongo` keeps track of applied migrations in a `changelog` collection in your MongoDB database
- Only new migrations that haven't been run will be applied

## Available Commands

These commands are available as npm scripts:

```bash
# Check status of migrations (which ones have run, which are pending)
npm run migrate:status

# Run all pending migrations
npm run migrate:up

# Roll back the most recently applied migration
npm run migrate:down

# Create a new migration file
npm run migrate:create your-migration-name
```

## Creating a New Migration

1. Run: `npm run migrate:create your-migration-name`
2. Edit the newly created migration file in `migrations/` directory
3. Implement the `up` function to apply changes
4. Implement the `down` function to roll back changes (if possible)

Example migration file:

```javascript
module.exports = {
  async up(db) {
    // Migration code goes here
    await db.collection('users').updateMany({}, { $set: { isActive: true } });
  },

  async down(db) {
    // Rollback code goes here
    await db.collection('users').updateMany({}, { $unset: { isActive: "" } });
  }
};
```

## Running Migrations in CI/CD

Add the migration step to your deployment scripts:

```yaml
# Example GitHub Actions step
- name: Apply database migrations
  run: npm run migrate:up
```

The migration framework will automatically detect which migrations need to be run, so you don't need to manually update your CI/CD pipeline each time you add a new migration.

## Best Practices

1. **Make migrations idempotent**: They should be safe to run multiple times
2. **Test migrations** before running in production
3. **Include both `up` and `down` functions** when possible
4. **Keep migrations small and focused** on a specific change
5. **Use unique, descriptive names** for your migrations 