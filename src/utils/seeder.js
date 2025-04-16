const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Load environment configuration
const configPath = path.resolve(__dirname, '../config/config.js');
require(configPath);

// Load models
const Violation = require('../models/Violation');
const User = require('../models/User');

// Connect to database using the loaded config
mongoose.connect(process.env.MONGO_URI);

// Sample violation data
const violations = [
  {
    type: 'AIRSTRIKE',
    date: '2023-06-15',
    reported_date: '2023-06-16',
    location: {
      coordinates: [37.1, 36.2],
      name: 'Aleppo',
      administrative_division: 'Aleppo Governorate'
    },
    description: 'Aerial bombardment of civilian area in eastern Aleppo',
    source: 'Syrian Observatory for Human Rights',
    source_url: 'https://example.com/sohr/report/12345',
    verified: true,
    certainty_level: 'confirmed',
    verification_method: 'Multiple eyewitness accounts and satellite imagery',
    casualties: 12,
    victims: [
      {
        age: 34,
        gender: 'male',
        status: 'civilian',
        sectarian_identity: 'Sunni',
        death_date: '2023-06-15'
      },
      {
        gender: 'female',
        status: 'civilian',
        death_date: '2023-06-16'
      }
    ],
    perpetrator: 'Syrian Air Force',
    perpetrator_affiliation: 'government',
    media_links: [
      'https://example.com/evidence/airstrike_1.jpg',
      'https://example.com/evidence/airstrike_1_video.mp4'
    ],
    tags: ['airstrike', 'civilian', 'urban area']
  },
  {
    type: 'CHEMICAL_ATTACK',
    date: '2023-02-10',
    reported_date: '2023-02-11',
    location: {
      coordinates: [36.7, 36.8],
      name: 'Idlib',
      administrative_division: 'Idlib Governorate'
    },
    description: 'Suspected chlorine gas attack in rural Idlib affecting civilian population',
    source: 'Médecins Sans Frontières',
    source_url: 'https://example.com/msf/report/5678',
    verified: true,
    certainty_level: 'probable',
    verification_method: 'Medical reports and symptoms consistent with chlorine exposure',
    casualties: 3,
    victims: [
      {
        age: 45,
        gender: 'male',
        status: 'civilian',
        death_date: '2023-02-10'
      },
      {
        age: 12,
        gender: 'female',
        status: 'civilian',
        death_date: '2023-02-10'
      },
      {
        age: 67,
        gender: 'male',
        status: 'civilian',
        death_date: '2023-02-11'
      }
    ],
    perpetrator: 'Syrian Military',
    perpetrator_affiliation: 'government',
    media_links: [
      'https://example.com/evidence/chemical_attack_2.jpg'
    ],
    tags: ['chemical', 'civilian', 'rural area']
  },
  {
    type: 'DETENTION',
    date: '2023-05-20',
    reported_date: '2023-05-25',
    location: {
      coordinates: [36.3, 33.5],
      name: 'Damascus',
      administrative_division: 'Damascus Governorate'
    },
    description: 'Arbitrary detention of opposition activist by security forces',
    source: 'Syrian Network for Human Rights',
    source_url: 'https://example.com/snhr/report/9876',
    verified: true,
    certainty_level: 'confirmed',
    verification_method: 'Family testimony and witness accounts',
    perpetrator: 'General Intelligence Directorate',
    perpetrator_affiliation: 'government',
    tags: ['detention', 'activist', 'opposition']
  },
  {
    type: 'SHELLING',
    date: '2023-07-05',
    reported_date: '2023-07-05',
    location: {
      coordinates: [38.0, 36.0],
      name: 'Deir ez-Zor',
      administrative_division: 'Deir ez-Zor Governorate'
    },
    description: 'Artillery shelling of residential neighborhood resulting in multiple casualties',
    source: 'Local Coordination Committees',
    verified: true,
    certainty_level: 'confirmed',
    verification_method: 'Video evidence and multiple witness testimonies',
    casualties: 8,
    victims: [
      {
        gender: 'male',
        status: 'civilian',
        death_date: '2023-07-05'
      },
      {
        gender: 'female',
        status: 'civilian',
        death_date: '2023-07-05'
      },
      {
        age: 7,
        gender: 'male',
        status: 'civilian',
        death_date: '2023-07-05'
      }
    ],
    perpetrator: 'IS-affiliated group',
    perpetrator_affiliation: 'extremist',
    media_links: [
      'https://example.com/evidence/shelling_3.jpg',
      'https://example.com/evidence/shelling_3_video.mp4'
    ],
    tags: ['shelling', 'civilian', 'residential']
  },
  {
    type: 'SIEGE',
    date: '2023-01-01',
    reported_date: '2023-01-15',
    location: {
      coordinates: [36.9, 35.6],
      name: 'Homs',
      administrative_division: 'Homs Governorate'
    },
    description: 'Ongoing siege of opposition-held neighborhood preventing food and medical supplies',
    source: 'Human Rights Watch',
    source_url: 'https://example.com/hrw/report/2468',
    verified: true,
    certainty_level: 'confirmed',
    verification_method: 'Satellite imagery and humanitarian worker testimonies',
    casualties: 5,
    perpetrator: 'Syrian Military',
    perpetrator_affiliation: 'government',
    tags: ['siege', 'humanitarian', 'starvation']
  }
];

// Sample user data (for testing)
const users = [
  {
    name: 'Admin User',
    email: 'admin@example.com',
    password: bcrypt.hashSync('password123', 10),
    role: 'admin',
    organization: 'Syria Violations Tracker'
  },
  {
    name: 'Editor User',
    email: 'editor@example.com',
    password: bcrypt.hashSync('password123', 10),
    role: 'editor',
    organization: 'Syrian Network for Human Rights'
  },
  {
    name: 'Regular User',
    email: 'user@example.com',
    password: bcrypt.hashSync('password123', 10),
    role: 'user',
    organization: 'Human Rights Watch'
  }
];

// Import data
const importData = async () => {
  try {
    // Add related violations IDs
    const violationIds = [];
    for (let i = 0; i < 5; i++) {
      violationIds.push(`vio-${uuidv4().substring(0, 6)}`);
    }
    
    // Add related_violations references
    for (let i = 0; i < violations.length; i++) {
      const violation = violations[i];
      
      // Randomly assign 0-2 related violations
      const relatedCount = Math.floor(Math.random() * 3);
      if (relatedCount > 0) {
        violation.related_violations = [];
        for (let j = 0; j < relatedCount; j++) {
          // Choose a random violation ID that isn't the current one
          const randomIndex = Math.floor(Math.random() * violationIds.length);
          if (!violation.related_violations.includes(violationIds[randomIndex])) {
            violation.related_violations.push(violationIds[randomIndex]);
          }
        }
      }
    }
    
    await Violation.deleteMany();
    await User.deleteMany();
    
    const createdUsers = await User.insertMany(users);
    
    // Add user references to violations
    const adminId = createdUsers[0]._id;
    const editorId = createdUsers[1]._id;
    
    const violationsWithUsers = violations.map(violation => ({
      ...violation,
      created_by: Math.random() > 0.5 ? adminId : editorId,
      updated_by: Math.random() > 0.5 ? adminId : editorId
    }));
    
    await Violation.insertMany(violationsWithUsers);
    
    console.log('Data imported successfully');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

// Delete data
const deleteData = async () => {
  try {
    await Violation.deleteMany();
    await User.deleteMany();
    
    console.log('Data destroyed successfully');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

// Command line arguments
if (process.argv[2] === '-i') {
  importData();
} else if (process.argv[2] === '-d') {
  deleteData();
} else {
  console.log('Please use correct flags: -i to import or -d to delete data');
  process.exit();
}