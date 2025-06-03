const fs = require('fs');
const path = require('path');

class FixtureSanitizer {
  constructor() {
    // Define patterns for different API keys that need to be sanitized
    this.patterns = [
      {
        name: 'GOOGLE_API_KEY',
        regex: /AIza[A-Za-z0-9_-]{35}/g,
        placeholder: '{{GOOGLE_API_KEY}}'
      },
      {
        name: 'CLAUDE_API_KEY', 
        regex: /sk-ant-[A-Za-z0-9_-]+/g,
        placeholder: '{{CLAUDE_API_KEY}}'
      }
      // Add more patterns as needed
    ];
  }

  /**
   * Sanitize a fixture by replacing API keys with placeholders
   */
  sanitizeFixture(fixturePath) {
    if (!fs.existsSync(fixturePath)) {
      return;
    }

    let content = fs.readFileSync(fixturePath, 'utf8');
    let modified = false;

    this.patterns.forEach(pattern => {
      if (pattern.regex.test(content)) {
        content = content.replace(pattern.regex, pattern.placeholder);
        modified = true;
        console.log(`✅ Sanitized ${pattern.name} in ${path.basename(fixturePath)}`);
      }
    });

    if (modified) {
      fs.writeFileSync(fixturePath, content);
    }
  }

  /**
   * Restore API keys in fixture content for runtime use
   */
  restoreFixture(fixtureContent, apiKeys = {}) {
    let content = typeof fixtureContent === 'string' ? fixtureContent : JSON.stringify(fixtureContent);
    
    this.patterns.forEach(pattern => {
      const envVar = pattern.name;
      const apiKey = apiKeys[envVar] || process.env[envVar] || 'test-api-key';
      content = content.replace(new RegExp(pattern.placeholder.replace(/[{}]/g, '\\$&'), 'g'), apiKey);
    });

    try {
      return JSON.parse(content);
    } catch (e) {
      console.warn('Failed to parse fixture content as JSON, returning as string');
      return content;
    }
  }

  /**
   * Sanitize all fixtures in a directory
   */
  sanitizeDirectory(fixturesDir) {
    if (!fs.existsSync(fixturesDir)) {
      console.log(`Fixtures directory not found: ${fixturesDir}`);
      return;
    }

    const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json'));
    files.forEach(file => {
      this.sanitizeFixture(path.join(fixturesDir, file));
    });
    
    console.log(`🧹 Sanitized ${files.length} fixture files in ${fixturesDir}`);
  }
}

module.exports = new FixtureSanitizer(); 