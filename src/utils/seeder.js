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

// Sample violation data
const violations = [
  {
    type: 'AIRSTRIKE',
    date: '2023-06-15',
    reported_date: '2023-06-16',
    location: {
      coordinates: [37.1, 36.2],
      name: {
        en: 'Aleppo',
        ar: 'حلب'
      },
      administrative_division: {
        en: 'Aleppo Governorate',
        ar: 'محافظة حلب'
      }
    },
    description: {
      en: 'Aerial bombardment of civilian area in eastern Aleppo',
      ar: 'قصف جوي لمنطقة مدنية في شرق حلب'
    },
    source: {
      en: 'Syrian Observatory for Human Rights',
      ar: 'المرصد السوري لحقوق الإنسان'
    },
    source_url: {
      en: 'https://example.com/sohr/report/12345',
      ar: 'https://example.com/sohr/report/12345'
    },
    verified: true,
    certainty_level: 'confirmed',
    verification_method: {
      en: 'Multiple eyewitness accounts and satellite imagery',
      ar: 'شهادات متعددة من شهود عيان وصور الأقمار الصناعية'
    },
    casualties: 12,
    victims: [
      {
        age: 34,
        gender: 'male',
        status: 'civilian',
        group_affiliation: {
          en: 'None',
          ar: 'لا يوجد'
        },
        sectarian_identity: {
          en: 'Sunni',
          ar: 'سني'
        },
        death_date: '2023-06-15'
      },
      {
        gender: 'female',
        status: 'civilian',
        group_affiliation: {
          en: 'None',
          ar: 'لا يوجد'
        },
        sectarian_identity: {
          en: 'Sunni',
          ar: 'سني'
        },
        death_date: '2023-06-16'
      }
    ],
    perpetrator: {
      en: 'Syrian Air Force',
      ar: 'القوات الجوية السورية'
    },
    perpetrator_affiliation: {
      en: 'government',
      ar: 'حكومي'
    },
    media_links: [
      'https://example.com/evidence/airstrike_1.jpg',
      'https://example.com/evidence/airstrike_1_video.mp4'
    ],
    tags: [
      { en: 'airstrike', ar: 'قصف جوي' },
      { en: 'civilian', ar: 'مدني' },
      { en: 'urban area', ar: 'منطقة حضرية' }
    ]
  },
  {
    type: 'CHEMICAL_ATTACK',
    date: '2023-02-10',
    reported_date: '2023-02-11',
    location: {
      coordinates: [36.7, 36.8],
      name: {
        en: 'Idlib',
        ar: 'إدلب'
      },
      administrative_division: {
        en: 'Idlib Governorate',
        ar: 'محافظة إدلب'
      }
    },
    description: {
      en: 'Suspected chlorine gas attack in rural Idlib affecting civilian population',
      ar: 'هجوم مشتبه به بغاز الكلور في ريف إدلب يؤثر على السكان المدنيين'
    },
    source: {
      en: 'Médecins Sans Frontières',
      ar: 'أطباء بلا حدود'
    },
    source_url: {
      en: 'https://example.com/msf/report/5678',
      ar: 'https://example.com/msf/report/5678'
    },
    verified: true,
    certainty_level: 'probable',
    verification_method: {
      en: 'Medical reports and symptoms consistent with chlorine exposure',
      ar: 'تقارير طبية وأعراض متوافقة مع التعرض للكلور'
    },
    casualties: 3,
    victims: [
      {
        age: 45,
        gender: 'male',
        status: 'civilian',
        group_affiliation: {
          en: 'None',
          ar: 'لا يوجد'
        },
        sectarian_identity: {
          en: 'Sunni',
          ar: 'سني'
        },
        death_date: '2023-02-10'
      },
      {
        age: 12,
        gender: 'female',
        status: 'civilian',
        group_affiliation: {
          en: 'None',
          ar: 'لا يوجد'
        },
        sectarian_identity: {
          en: 'Sunni',
          ar: 'سني'
        },
        death_date: '2023-02-10'
      },
      {
        age: 67,
        gender: 'male',
        status: 'civilian',
        group_affiliation: {
          en: 'None',
          ar: 'لا يوجد'
        },
        sectarian_identity: {
          en: 'Sunni',
          ar: 'سني'
        },
        death_date: '2023-02-11'
      }
    ],
    perpetrator: {
      en: 'Syrian Military',
      ar: 'الجيش السوري'
    },
    perpetrator_affiliation: {
      en: 'government',
      ar: 'حكومي'
    },
    media_links: [
      'https://example.com/evidence/chemical_attack_2.jpg'
    ],
    tags: [
      { en: 'chemical', ar: 'كيميائي' },
      { en: 'civilian', ar: 'مدني' },
      { en: 'rural area', ar: 'منطقة ريفية' }
    ]
  },
  {
    type: 'DETENTION',
    date: '2023-05-20',
    reported_date: '2023-05-25',
    location: {
      coordinates: [36.3, 33.5],
      name: {
        en: 'Damascus',
        ar: 'دمشق'
      },
      administrative_division: {
        en: 'Damascus Governorate',
        ar: 'محافظة دمشق'
      }
    },
    description: {
      en: 'Arbitrary detention of opposition activist by security forces',
      ar: 'اعتقال تعسفي لناشط معارض من قبل قوات الأمن'
    },
    source: {
      en: 'Syrian Network for Human Rights',
      ar: 'الشبكة السورية لحقوق الإنسان'
    },
    source_url: {
      en: 'https://example.com/snhr/report/9876',
      ar: 'https://example.com/snhr/report/9876'
    },
    verified: true,
    certainty_level: 'confirmed',
    verification_method: {
      en: 'Family testimony and witness accounts',
      ar: 'شهادة العائلة وشهادات الشهود'
    },
    perpetrator: {
      en: 'General Intelligence Directorate',
      ar: 'مديرية المخابرات العامة'
    },
    perpetrator_affiliation: {
      en: 'government',
      ar: 'حكومي'
    },
    tags: [
      { en: 'detention', ar: 'اعتقال' },
      { en: 'activist', ar: 'ناشط' },
      { en: 'opposition', ar: 'معارضة' }
    ]
  },
  {
    type: 'SHELLING',
    date: '2023-07-05',
    reported_date: '2023-07-05',
    location: {
      coordinates: [38.0, 36.0],
      name: {
        en: 'Deir ez-Zor',
        ar: 'دير الزور'
      },
      administrative_division: {
        en: 'Deir ez-Zor Governorate',
        ar: 'محافظة دير الزور'
      }
    },
    description: {
      en: 'Artillery shelling of residential neighborhood resulting in multiple casualties',
      ar: 'قصف مدفعي على حي سكني أدى إلى إصابات متعددة'
    },
    source: {
      en: 'Local Coordination Committees',
      ar: 'لجان التنسيق المحلية'
    },
    source_url: {
      en: 'https://example.com/lcc/report/2468',
      ar: 'https://example.com/lcc/report/2468'
    },
    verified: true,
    certainty_level: 'confirmed',
    verification_method: {
      en: 'Video evidence and multiple witness testimonies',
      ar: 'دليل فيديو وشهادات متعددة من الشهود'
    },
    casualties: 8,
    victims: [
      {
        gender: 'male',
        status: 'civilian',
        group_affiliation: {
          en: 'None',
          ar: 'لا يوجد'
        },
        sectarian_identity: {
          en: 'Sunni',
          ar: 'سني'
        },
        death_date: '2023-07-05'
      },
      {
        gender: 'female',
        status: 'civilian',
        group_affiliation: {
          en: 'None',
          ar: 'لا يوجد'
        },
        sectarian_identity: {
          en: 'Sunni',
          ar: 'سني'
        },
        death_date: '2023-07-05'
      },
      {
        age: 7,
        gender: 'male',
        status: 'civilian',
        group_affiliation: {
          en: 'None',
          ar: 'لا يوجد'
        },
        sectarian_identity: {
          en: 'Sunni',
          ar: 'سني'
        },
        death_date: '2023-07-05'
      }
    ],
    perpetrator: {
      en: 'IS-affiliated group',
      ar: 'مجموعة تابعة لداعش'
    },
    perpetrator_affiliation: {
      en: 'extremist',
      ar: 'متطرف'
    },
    media_links: [
      'https://example.com/evidence/shelling_3.jpg',
      'https://example.com/evidence/shelling_3_video.mp4'
    ],
    tags: [
      { en: 'shelling', ar: 'قصف' },
      { en: 'civilian', ar: 'مدني' },
      { en: 'residential', ar: 'سكني' }
    ]
  },
  {
    type: 'SIEGE',
    date: '2023-01-01',
    reported_date: '2023-01-15',
    location: {
      coordinates: [36.9, 35.6],
      name: {
        en: 'Homs',
        ar: 'حمص'
      },
      administrative_division: {
        en: 'Homs Governorate',
        ar: 'محافظة حمص'
      }
    },
    description: {
      en: 'Ongoing siege of opposition-held neighborhood preventing food and medical supplies',
      ar: 'حصار مستمر على حي تسيطر عليه المعارضة يمنع وصول المواد الغذائية والإمدادات الطبية'
    },
    source: {
      en: 'Human Rights Watch',
      ar: 'هيومن رايتس ووتش'
    },
    source_url: {
      en: 'https://example.com/hrw/report/2468',
      ar: 'https://example.com/hrw/report/2468'
    },
    verified: true,
    certainty_level: 'confirmed',
    verification_method: {
      en: 'Satellite imagery and humanitarian worker testimonies',
      ar: 'صور الأقمار الصناعية وشهادات العاملين في المجال الإنساني'
    },
    casualties: 5,
    perpetrator: {
      en: 'Syrian Military',
      ar: 'الجيش السوري'
    },
    perpetrator_affiliation: {
      en: 'government',
      ar: 'حكومي'
    },
    tags: [
      { en: 'siege', ar: 'حصار' },
      { en: 'humanitarian', ar: 'إنساني' },
      { en: 'starvation', ar: 'تجويع' }
    ]
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

// Connect to database
const connectDB = async () => {
  try {
    console.log('Connecting to MongoDB...');
    console.log('MongoDB URI:', process.env.MONGO_URI);
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

// Import data
const importData = async () => {
  try {
    // Connect to database first
    await connectDB();
    
    console.log('Preparing seed data...');
    
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
    
    console.log('Deleting existing data...');
    await Violation.deleteMany();
    await User.deleteMany();
    
    console.log('Inserting users...');
    const createdUsers = await User.insertMany(users);
    console.log(`${createdUsers.length} users inserted`);
    
    // Add user references to violations
    const adminId = createdUsers[0]._id;
    const editorId = createdUsers[1]._id;
    
    const violationsWithUsers = violations.map(violation => ({
      ...violation,
      created_by: Math.random() > 0.5 ? adminId : editorId,
      updated_by: Math.random() > 0.5 ? adminId : editorId
    }));
    
    console.log('Inserting violations...');
    const insertedViolations = await Violation.insertMany(violationsWithUsers);
    console.log(`${insertedViolations.length} violations inserted`);
    
    // Verify insertions
    const violationCount = await Violation.countDocuments();
    const userCount = await User.countDocuments();
    console.log(`Database now contains ${violationCount} violations and ${userCount} users`);
    
    console.log('Data imported successfully');
    
    // Close connection properly
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error(`Error during import: ${err.message}`);
    if (err.errors) {
      Object.keys(err.errors).forEach(key => {
        console.error(`Validation error for ${key}: ${err.errors[key].message}`);
      });
    }
    // Close connection properly
    if (mongoose.connection) await mongoose.connection.close();
    process.exit(1);
  }
};

// Delete data
const deleteData = async () => {
  try {
    // Connect to database first
    await connectDB();
    
    console.log('Deleting existing data...');
    await Violation.deleteMany();
    await User.deleteMany();
    
    // Verify deletion
    const violationCount = await Violation.countDocuments();
    const userCount = await User.countDocuments();
    console.log(`Database now contains ${violationCount} violations and ${userCount} users`);
    
    console.log('Data destroyed successfully');
    
    // Close connection properly
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error(`Error during deletion: ${err.message}`);
    // Close connection properly
    if (mongoose.connection) await mongoose.connection.close();
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
  process.exit(0);
}