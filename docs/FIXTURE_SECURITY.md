# Fixture Security and API Key Management

This document explains how we handle API keys in test fixtures to maintain security while preserving test functionality.

## Problem

Test fixtures often contain recorded HTTP requests/responses that include real API keys. Committing these to version control exposes sensitive credentials.

## Solution: Fixture Sanitization

We use an automated sanitization system that:

1. **Replaces API keys with placeholders** when fixtures are recorded
2. **Restores API keys at runtime** when tests are executed
3. **Automatically sanitizes** fixtures before commits via git hooks

## How It Works

### 1. Recording Fixtures

When recording new fixtures with `npm run test:record-geocoder`:

```bash
# Records real API responses
RECORD=true npm test src/tests/utils/geocoder.test.js

# Automatically sanitizes after recording
npm run test:sanitize-fixtures
```

### 2. Fixture Format

Sanitized fixtures contain placeholders instead of real API keys:

```json
{
  "scope": "https://maps.googleapis.com",
  "path": "/maps/api/geocode/json?key={{GOOGLE_API_KEY}}&address=Damascus",
  "response": { ... }
}
```

### 3. Runtime Restoration

During test execution, placeholders are replaced with actual API keys:

```javascript
const fixtures = fixtureSanitizer.restoreFixture(fixtureContent, {
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || 'test-api-key'
});
```

## Supported API Key Patterns

The sanitizer recognizes these patterns:

- **Google API Keys**: `AIza[A-Za-z0-9_-]{35}`
- **Claude API Keys**: `sk-ant-[A-Za-z0-9_-]+`

## Usage

### Manual Sanitization

```bash
# Sanitize all fixtures
npm run test:sanitize-fixtures

# Clean all fixtures
npm run test:clean-fixtures
```

### Recording New Fixtures

```bash
# Record with real API key, auto-sanitize after
npm run test:record-geocoder
```

### Running Tests

```bash
# Tests work with or without real API keys
npm test

# With real API key (for new recordings)
GOOGLE_API_KEY=your_key npm test
```

## CI/CD Integration

### GitHub Actions

Tests run with sanitized fixtures. Optional real API keys can be provided via GitHub Secrets:

```yaml
env:
  GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}  # Optional
```

### Pre-commit Hook

Automatically sanitizes fixtures before commits:

```bash
# Installed via husky
.husky/pre-commit
```

## Security Benefits

✅ **No API keys in version control**  
✅ **Tests work without real credentials**  
✅ **Automatic sanitization prevents accidents**  
✅ **Realistic test data preserved**  
✅ **CI/CD compatibility**  

## Adding New API Key Patterns

To support additional API services, update `src/tests/utils/fixtureSanitizer.js`:

```javascript
this.patterns = [
  // ... existing patterns
  {
    name: 'NEW_SERVICE_API_KEY',
    regex: /new-service-[A-Za-z0-9]+/g,
    placeholder: '{{NEW_SERVICE_API_KEY}}'
  }
];
```

## Best Practices

1. **Always use environment variables** for API keys
2. **Never commit real credentials** to version control
3. **Run sanitization** after recording new fixtures
4. **Test with and without** real API keys
5. **Use restricted API keys** for testing when possible

## Troubleshooting

### Tests Failing Without API Key

This is expected. Tests should work with fixtures even without real API keys.

### New API Key Pattern Not Detected

Add the pattern to `fixtureSanitizer.js` and run sanitization again.

### Fixture Restoration Issues

Check that the placeholder format matches exactly: `{{API_KEY_NAME}}` 