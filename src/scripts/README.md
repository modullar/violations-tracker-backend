# Database Import Scripts

This directory contains scripts for importing data between different database environments.

## Import Violations to Production

The `importViolationsToProduction.js` script allows you to import violations with a specific date from your local database to the production database.

### Prerequisites

1. Ensure you have the following environment variables set:
   - `MONGO_URI_LOCAL`: Connection string for your local MongoDB database
   - `MONGO_URI_PROD`: Connection string for your production MongoDB database

2. Make sure both databases are accessible and you have the necessary permissions.

### Usage

To run the script:

```bash
# From the project root directory
node src/scripts/importViolationsToProduction.js

# Or using npm script
npm run import:violations
```

### What the script does

1. **Connects to both databases**: Establishes connections to both local and production MongoDB instances
2. **Finds violations by date**: Searches for violations with the date "2025-06-30" in the local database
3. **Processes in batches**: Imports violations in batches of 50 to avoid memory issues
4. **Handles duplicates**: Uses upsert operations to avoid duplicate violations based on:
   - `type`
   - `date`
   - `location.name.en`
   - `perpetrator_affiliation`
5. **Provides detailed logging**: Shows progress and summary statistics
6. **Cleans data**: Removes MongoDB-specific fields (`_id`, `__v`) before importing

### Output

The script provides detailed logging including:
- Number of violations found with the specified date
- Progress updates for each batch
- Final summary with counts of:
  - Total violations found
  - Successfully migrated
  - Skipped (already existed)
  - Errors

### Customization

To import violations with a different date, modify the `targetDate` variable in the script:

```javascript
const targetDate = new Date('2025-06-30'); // Change this to your desired date
```

### Safety Features

- **Upsert operations**: Won't create duplicates if reports already exist
- **Batch processing**: Prevents memory issues with large datasets
- **Error handling**: Continues processing even if individual batches fail
- **Connection cleanup**: Properly closes database connections when done

### Troubleshooting

1. **Connection errors**: Verify your MongoDB connection strings are correct
2. **Permission errors**: Ensure you have read access to local DB and write access to production DB
3. **No violations found**: Check that violations with the specified date exist in your local database
4. **Memory issues**: The script processes in batches, but if you have a very large number of violations, you may need to adjust the `BATCH_SIZE` constant 