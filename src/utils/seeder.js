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
    perpetrator_affiliation: 'post_8th_december_government',
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
    perpetrator_affiliation: 'post_8th_december_government',
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
    perpetrator_affiliation: 'post_8th_december_government',
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
      en: 'ISIS',
      ar: 'داعش'
    },
    perpetrator_affiliation: 'isis',
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
    perpetrator_affiliation: 'post_8th_december_government',
    tags: [
      { en: 'siege', ar: 'حصار' },
      { en: 'humanitarian', ar: 'إنساني' },
      { en: 'starvation', ar: 'تجويع' }
    ]
  },
  {
    type: 'DISPLACEMENT',
    date: '2023-08-12',
    reported_date: '2023-08-14',
    location: {
      coordinates: [38.3, 35.8],
      name: {
        en: 'Raqqa',
        ar: 'الرقة'
      },
      administrative_division: {
        en: 'Raqqa Governorate',
        ar: 'محافظة الرقة'
      }
    },
    description: {
      en: 'Forced displacement of hundreds of residents after heavy clashes',
      ar: 'تهجير قسري لمئات السكان بعد اشتباكات عنيفة'
    },
    source: {
      en: 'UNHCR field report',
      ar: 'تقرير المفوضية السامية لشؤون اللاجئين'
    },
    source_url: {
      en: 'https://example.com/unhcr/report/8001',
      ar: 'https://example.com/unhcr/report/8001'
    },
    verified: false,
    certainty_level: 'possible',
    verification_method: {
      en: 'Field interviews with displaced families',
      ar: 'مقابلات ميدانية مع عائلات نازحة'
    },
    casualties: 0,
    perpetrator: {
      en: 'Syrian Military',
      ar: 'الجيش السوري'
    },
    perpetrator_affiliation: 'post_8th_december_government',
    tags: [
      { en: 'displacement', ar: 'نزوح' },
      { en: 'civilians', ar: 'مدنيون' }
    ]
  },
  {
    type: 'TORTURE',
    date: '2023-03-10',
    reported_date: '2023-03-12',
    location: {
      coordinates: [35.5, 35.8],
      name: {
        en: 'Latakia',
        ar: 'اللاذقية'
      },
      administrative_division: {
        en: 'Latakia Governorate',
        ar: 'محافظة اللاذقية'
      }
    },
    description: {
      en: 'Combatant captured and subjected to severe torture in detention center',
      ar: 'تعذيب قاس لمقاتل محتجز في مركز احتجاز'
    },
    source: {
      en: 'Amnesty International',
      ar: 'منظمة العفو الدولية'
    },
    source_url: {
      en: 'https://example.com/amnesty/report/4455',
      ar: 'https://example.com/amnesty/report/4455'
    },
    verified: true,
    certainty_level: 'probable',
    verification_method: {
      en: 'Medical examination and photographic evidence',
      ar: 'فحص طبي وأدلة تصويرية'
    },
    casualties: 1,
    victims: [
      {
        age: 28,
        gender: 'male',
        status: 'combatant',
        group_affiliation: {
          en: 'Opposition armed group',
          ar: 'فصيل معارض مسلح'
        },
        sectarian_identity: { en: 'Unknown', ar: 'غير معروف' },
        death_date: '2023-03-10'
      }
    ],
    perpetrator: {
      en: 'Military Intelligence Directorate',
      ar: 'إدارة المخابرات العسكرية'
    },
    perpetrator_affiliation: 'post_8th_december_government',
    tags: [
      { en: 'torture', ar: 'تعذيب' },
      { en: 'detention', ar: 'احتجاز' },
      { en: 'combatant', ar: 'مقاتل' }
    ]
  },
  {
    type: 'EXECUTION',
    date: '2023-04-22',
    reported_date: '2023-04-23',
    location: {
      coordinates: [40.2, 36.6],
      name: {
        en: 'Al-Hasakah',
        ar: 'الحسكة'
      },
      administrative_division: {
        en: 'Al-Hasakah Governorate',
        ar: 'محافظة الحسكة'
      }
    },
    description: {
      en: 'Public execution of suspected collaborators in town square',
      ar: 'إعدام علني لمشتبه بتعاونهم في ساحة البلدة'
    },
    source: {
      en: 'Local media outlets',
      ar: 'وسائل إعلام محلية'
    },
    source_url: {
      en: 'https://example.com/localmedia/report/9912',
      ar: 'https://example.com/localmedia/report/9912'
    },
    verified: true,
    certainty_level: 'confirmed',
    verification_method: {
      en: 'Video circulated on social media verified by analysts',
      ar: 'فيديو متداول على وسائل التواصل تم التحقق منه بواسطة محللين'
    },
    casualties: 4,
    victims: [
      { gender: 'male', status: 'civilian', group_affiliation: { en: 'None', ar: 'لا يوجد' }, sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }, death_date: '2023-04-22' },
      { gender: 'male', status: 'civilian', group_affiliation: { en: 'None', ar: 'لا يوجد' }, sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }, death_date: '2023-04-22' },
      { gender: 'female', status: 'civilian', group_affiliation: { en: 'None', ar: 'لا يوجد' }, sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }, death_date: '2023-04-22' },
      { gender: 'male', status: 'civilian', group_affiliation: { en: 'None', ar: 'لا يوجد' }, sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }, death_date: '2023-04-22' }
    ],
    perpetrator: {
      en: 'ISIS',
      ar: 'داعش'
    },
    perpetrator_affiliation: 'isis',
    media_links: [
      'https://example.com/evidence/execution_1.jpg'
    ],
    tags: [
      { en: 'execution', ar: 'إعدام' },
      { en: 'extremist', ar: 'متطرف' }
    ]
  },
  {
    type: 'EXPLOSION',
    date: '2023-09-01',
    reported_date: '2023-09-02',
    location: {
      coordinates: [37.3, 37.0],
      name: {
        en: 'Azaz',
        ar: 'أعزاز'
      },
      administrative_division: {
        en: 'Aleppo Governorate',
        ar: 'محافظة حلب'
      }
    },
    description: {
      en: 'Car bomb explosion near busy marketplace',
      ar: 'انفجار سيارة مفخخة قرب سوق مزدحم'
    },
    source: {
      en: 'Civil Defense (White Helmets)',
      ar: 'الدفاع المدني (الخوذ البيضاء)'
    },
    source_url: {
      en: 'https://example.com/whitehelmets/report/3021',
      ar: 'https://example.com/whitehelmets/report/3021'
    },
    verified: false,
    certainty_level: 'possible',
    verification_method: {
      en: 'First responders reports and photographs',
      ar: 'تقارير المستجيبين الأوائل وصور'
    },
    casualties: 9,
    victims: [
      { gender: 'male', status: 'civilian', group_affiliation: { en: 'None', ar: 'لا يوجد' }, sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }, death_date: '2023-09-01' },
      { gender: 'female', status: 'civilian', group_affiliation: { en: 'None', ar: 'لا يوجد' }, sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }, death_date: '2023-09-01' }
    ],
    perpetrator: {
      en: 'Unknown',
      ar: 'مجهول'
    },
    perpetrator_affiliation: 'assad_regime',
    media_links: [
      'https://example.com/evidence/explosion_4.jpg'
    ],
    tags: [
      { en: 'explosion', ar: 'انفجار' },
      { en: 'market', ar: 'سوق' }
    ]
  },
  {
    type: 'AMBUSH',
    date: '2023-11-05',
    reported_date: '2023-11-06',
    location: {
      coordinates: [36.0, 32.6],
      name: {
        en: 'Daraa',
        ar: 'درعا'
      },
      administrative_division: {
        en: 'Daraa Governorate',
        ar: 'محافظة درعا'
      }
    },
    description: {
      en: 'Ambush on military convoy leading to multiple combatant deaths',
      ar: 'كمين استهدف قافلة عسكرية أدى إلى مقتل عدة مقاتلين'
    },
    source: {
      en: 'Rebel media center',
      ar: 'مركز إعلامي معارض'
    },
    source_url: {
      en: 'https://example.com/rebel/report/5566',
      ar: 'https://example.com/rebel/report/5566'
    },
    verified: true,
    certainty_level: 'probable',
    verification_method: {
      en: 'Photographs of destroyed vehicles and bodies',
      ar: 'صور للمركبات المدمرة والجثث'
    },
    casualties: 6,
    victims: [
      { gender: 'male', status: 'combatant', group_affiliation: { en: 'Opposition armed group', ar: 'فصيل معارض مسلح' }, sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }, death_date: '2023-11-05' },
      { gender: 'male', status: 'combatant', group_affiliation: { en: 'Opposition armed group', ar: 'فصيل معارض مسلح' }, sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }, death_date: '2023-11-05' }
    ],
    perpetrator: {
      en: 'Opposition armed group',
      ar: 'فصيل معارض مسلح'
    },
    perpetrator_affiliation: 'post_8th_december_government',
    tags: [
      { en: 'ambush', ar: 'كمين' },
      { en: 'combatant', ar: 'مقاتل' }
    ]
  },
  {
    type: 'KIDNAPPING',
    date: '2023-10-15',
    reported_date: '2023-10-16',
    location: {
      coordinates: [41.2, 37.1],
      name: {
        en: 'Qamishli',
        ar: 'القامشلي'
      },
      administrative_division: {
        en: 'Al-Hasakah Governorate',
        ar: 'محافظة الحسكة'
      }
    },
    description: {
      en: 'Abduction of humanitarian worker at checkpoint',
      ar: 'اختطاف عامل إغاثي عند نقطة تفتيش'
    },
    source: {
      en: 'Humanitarian NGO statement',
      ar: 'بيان منظمة إنسانية'
    },
    source_url: {
      en: 'https://example.com/ngo/report/7412',
      ar: 'https://example.com/ngo/report/7412'
    },
    verified: false,
    certainty_level: 'possible',
    verification_method: {
      en: 'Contact with organization and family members',
      ar: 'الاتصال بالمنظمة وأفراد الأسرة'
    },
    casualties: 0,
    perpetrator: {
      en: 'Unknown armed group',
      ar: 'مجموعة مسلحة مجهولة'
    },
    perpetrator_affiliation: 'unknown',
    tags: [
      { en: 'kidnapping', ar: 'اختطاف' },
      { en: 'humanitarian', ar: 'إنساني' }
    ]
  },
  {
    type: 'MURDER',
    date: '2023-07-30',
    reported_date: '2023-08-01',
    location: {
      coordinates: [36.7, 35.1],
      name: {
        en: 'Hama',
        ar: 'حماة'
      },
      administrative_division: {
        en: 'Hama Governorate',
        ar: 'محافظة حماة'
      }
    },
    description: {
      en: 'Targeted killing of local council member',
      ar: 'قتل مستهدف لعضو مجلس محلي'
    },
    source: {
      en: 'Syrian Network for Human Rights',
      ar: 'الشبكة السورية لحقوق الإنسان'
    },
    source_url: {
      en: 'https://example.com/snhr/report/8841',
      ar: 'https://example.com/snhr/report/8841'
    },
    verified: true,
    certainty_level: 'probable',
    verification_method: {
      en: 'Witness accounts and medical report',
      ar: 'شهادات شهود وتقرير طبي'
    },
    casualties: 1,
    victims: [
      { gender: 'male', status: 'civilian', group_affiliation: { en: 'None', ar: 'لا يوجد' }, sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }, death_date: '2023-07-30' }
    ],
    perpetrator: {
      en: 'Extremist cell',
      ar: 'خلية متطرفة'
    },
    perpetrator_affiliation: 'post_8th_december_government',
    tags: [
      { en: 'murder', ar: 'قتل' },
      { en: 'targeted', ar: 'مستهدف' }
    ]
  },
  {
    type: 'HOME_INVASION',
    date: '2023-12-08',
    reported_date: '2023-12-09',
    location: {
      coordinates: [35.9, 34.9],
      name: {
        en: 'Tartus',
        ar: 'طرطوس'
      },
      administrative_division: {
        en: 'Tartus Governorate',
        ar: 'محافظة طرطوس'
      }
    },
    description: {
      en: 'Night raid on civilian home leading to arrest of occupants',
      ar: 'مداهمة ليلية لمنزل مدني أدى إلى اعتقال السكان'
    },
    source: {
      en: 'Local news agency',
      ar: 'وكالة أنباء محلية'
    },
    source_url: {
      en: 'https://example.com/localnews/report/1122',
      ar: 'https://example.com/localnews/report/1122'
    },
    verified: false,
    certainty_level: 'possible',
    verification_method: {
      en: 'Interview with neighbors and CCTV footage',
      ar: 'مقابلة مع الجيران وتسجيلات كاميرات المراقبة'
    },
    casualties: 0,
    victims: [
      {
        gender: 'female',
        status: 'civilian',
        group_affiliation: { en: 'None', ar: 'لا يوجد' },
        sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }
      }
    ],
    perpetrator: {
      en: 'Pro-government militia',
      ar: 'ميليشيا موالية للحكومة'
    },
    perpetrator_affiliation: 'post_8th_december_government',
    tags: [
      { en: 'home invasion', ar: 'مداهمة' },
      { en: 'arrest', ar: 'اعتقال' }
    ]
  },
  {
    type: 'SHOOTING',
    date: '2023-06-25',
    reported_date: '2023-06-26',
    location: {
      coordinates: [37.1, 36.3],
      name: {
        en: 'Aleppo (west)',
        ar: 'غرب حلب'
      },
      administrative_division: {
        en: 'Aleppo Governorate',
        ar: 'محافظة حلب'
      }
    },
    description: {
      en: 'Sniper shooting at checkpoint killing two passersby',
      ar: 'إطلاق نار قناص عند نقطة تفتيش أدى إلى مقتل اثنين من المارة'
    },
    source: {
      en: 'Syrian Observatory for Human Rights',
      ar: 'المرصد السوري لحقوق الإنسان'
    },
    source_url: {
      en: 'https://example.com/sohr/report/6677',
      ar: 'https://example.com/sohr/report/6677'
    },
    verified: true,
    certainty_level: 'confirmed',
    verification_method: {
      en: 'Verified video footage and geolocation',
      ar: 'تسجيل فيديو تم التحقق منه وتحديد الموقع الجغرافي'
    },
    casualties: 2,
    victims: [
      { gender: 'male', status: 'civilian', group_affiliation: { en: 'None', ar: 'لا يوجد' }, sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }, death_date: '2023-06-25' },
      { gender: 'female', status: 'civilian', group_affiliation: { en: 'None', ar: 'لا يوجد' }, sectarian_identity: { en: 'Unknown', ar: 'غير معروف' }, death_date: '2023-06-25' }
    ],
    perpetrator: {
      en: 'Rebel sniper',
      ar: 'قناص معارض'
    },
    perpetrator_affiliation: 'israel',
    tags: [
      { en: 'shooting', ar: 'إطلاق نار' },
      { en: 'civilian', ar: 'مدني' }
    ]
  },
  {
    type: 'OTHER',
    date: '2023-09-17',
    reported_date: '2023-09-17',
    location: {
      coordinates: [36.4, 34.8],
      name: {
        en: 'Salamiyah',
        ar: 'السلمية'
      },
      administrative_division: {
        en: 'Hama Governorate',
        ar: 'محافظة حماة'
      }
    },
    description: {
      en: 'Mysterious fire at ammunition depot causing panic',
      ar: 'حريق غامض في مستودع ذخيرة تسبب في ذعر'
    },
    source: {
      en: 'Reuters',
      ar: 'رويترز'
    },
    source_url: {
      en: 'https://example.com/reuters/report/2222',
      ar: 'https://example.com/reuters/report/2222'
    },
    verified: false,
    certainty_level: 'possible',
    verification_method: {
      en: 'Satellite imagery indicates fire; cause unverified',
      ar: 'صور الأقمار الصناعية تظهر حريق؛ السبب غير محقق'
    },
    casualties: 0,
    perpetrator: {
      en: 'Unknown',
      ar: 'مجهول'
    },
    perpetrator_affiliation: 'unknown',
    tags: [
      { en: 'fire', ar: 'حريق' },
      { en: 'other', ar: 'أخرى' }
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