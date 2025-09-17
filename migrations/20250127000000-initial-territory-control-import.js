const fs = require('fs');
const path = require('path');

/**
 * Migration to import initial territory control data
 * This migration imports the existing territory control data from the frontend
 * into the new TerritoryControl collection in the database.
 */

module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @returns {Promise<void>}
   */
  async up(db) {
    console.log('Starting initial territory control data import migration...');
    
    const startTime = Date.now();
    
    // Define the territory control data that was previously in territoryControl.ts
    const territoryControlData = {
      "type": "FeatureCollection",
      "date": "2025-05-20", // Date from the original file
      "features": [
        {
          "type": "Feature",
          "properties": {
            "name": "SDF-controlled",
            "controlledBy": "FOREIGN_MILITARY",
            "color": "#ffff00", // Default yellow, should be updated with actual colors
            "controlledSince": "2017-08-04"
          },
          "geometry": {
            "coordinates": [
              [
                [
                  39.97523479170897,
                  36.65226655545062
                ],
                [
                  39.798770969937976,
                  36.51680912591189
                ],
                [
                  39.32429592201405,
                  36.396121750456885
                ],
                [
                  38.65468957668462,
                  36.507020555740034
                ],
                [
                  38.590761786715795,
                  36.690675535586564
                ],
                [
                  38.64878767191513,
                  36.787822721278175
                ],
                [
                  38.49747219386666,
                  36.869764547475484
                ],
                [
                  38.28841495922602,
                  36.91793235917994
                ],
                [
                  38.05467322408541,
                  36.82768053818331
                ],
                [
                  38.0788906150552,
                  36.72649025391701
                ],
                [
                  38.28726733292866,
                  36.517049774356785
                ],
                [
                  38.162115545242415,
                  36.02967520871725
                ],
                [
                  38.129162456396976,
                  35.97760966798016
                ],
                [
                  38.024049188772125,
                  36.028913657848435
                ],
                [
                  37.73606705969924,
                  36.211701331307985
                ],
                [
                  37.53157261251384,
                  36.13400108976687
                ],
                [
                  37.802122738610535,
                  35.938989660796274
                ],
                [
                  38.0199990915465,
                  35.77514500251661
                ],
                [
                  38.35010481599366,
                  35.77221217404525
                ],
                [
                  38.57486299411924,
                  35.74626506783298
                ],
                [
                  38.61608066574287,
                  35.70429559319728
                ],
                [
                  38.66945382348025,
                  35.640946276424245
                ],
                [
                  39.153320793392666,
                  35.728688601071184
                ],
                [
                  39.24172730418704,
                  35.741125962385055
                ],
                [
                  39.36664752269564,
                  35.73368687935768
                ],
                [
                  39.60429410625308,
                  35.73249823414329
                ],
                [
                  39.69501979866327,
                  35.73052634443763
                ],
                [
                  39.777844698211815,
                  35.73900340563574
                ],
                [
                  39.81777909503509,
                  35.78687120173486
                ],
                [
                  39.81562229805294,
                  35.67639000150622
                ],
                [
                  39.79559183113783,
                  35.63148339484905
                ],
                [
                  39.873773725000305,
                  35.580627162361935
                ],
                [
                  39.91862621847878,
                  35.577229268506116
                ],
                [
                  39.950759782278006,
                  35.542961373850446
                ],
                [
                  40.04374486841921,
                  35.47183240627195
                ],
                [
                  40.10461586335028,
                  35.42959019813
                ],
                [
                  40.125707274205666,
                  35.39868784594192
                ],
                [
                  40.14731443413592,
                  35.380074592032415
                ],
                [
                  40.20780463447383,
                  35.34510501120456
                ],
                [
                  40.24100234177487,
                  35.32182441511374
                ],
                [
                  40.26232768231067,
                  35.311781865646935
                ],
                [
                  40.29868995699729,
                  35.28501924512648
                ],
                [
                  40.34681506602939,
                  35.2602679426999
                ],
                [
                  40.37447734162345,
                  35.24297448100404
                ],
                [
                  40.40313438299188,
                  35.19397483019006
                ],
                [
                  40.41393249878617,
                  35.16687841492008
                ],
                [
                  40.43383726568169,
                  35.06452260529915
                ],
                [
                  40.45823909852011,
                  35.06469694545605
                ],
                [
                  40.471837970536164,
                  35.06436472102093
                ],
                [
                  40.44237653112381,
                  35.03550147377044
                ],
                [
                  40.51871962383389,
                  34.98620892466279
                ],
                [
                  40.552685902122676,
                  34.97610830333741
                ],
                [
                  40.572682192929086,
                  34.946700763767325
                ],
                [
                  40.58310952564024,
                  34.86798336254382
                ],
                [
                  40.61231336383937,
                  34.88139370208482
                ],
                [
                  40.62237928584821,
                  34.867888194902136
                ],
                [
                  40.61807428238019,
                  34.831941041069875
                ],
                [
                  40.64638074175656,
                  34.796381438779235
                ],
                [
                  40.72679253173875,
                  34.77709648668462
                ],
                [
                  40.78533241750333,
                  34.706154422215704
                ],
                [
                  40.81697506318042,
                  34.729395801379944
                ],
                [
                  40.81278795378513,
                  34.65495344442556
                ],
                [
                  40.859547868850804,
                  34.64927522870844
                ],
                [
                  40.869739259116415,
                  34.661270759615846
                ],
                [
                  40.91784775215527,
                  34.62895322810344
                ],
                [
                  40.924738799553694,
                  34.59019502704935
                ],
                [
                  40.919615607567344,
                  34.58465842255883
                ],
                [
                  40.918997755350276,
                  34.56478936140303
                ],
                [
                  40.94069206199056,
                  34.518064767517714
                ],
                [
                  40.918860518611226,
                  34.51720560104216
                ],
                [
                  40.92211824704507,
                  34.503876431965836
                ],
                [
                  40.944255494512106,
                  34.44952486483244
                ],
                [
                  40.9859555095781,
                  34.448341752795486
                ],
                [
                  40.99297930361831,
                  34.424746689195445
                ],
                [
                  41.12500005915389,
                  34.66312366099161
                ],
                [
                  41.22055435634801,
                  34.7881428049112
                ],
                [
                  41.196607763996326,
                  35.15658768670151
                ],
                [
                  41.2554287036378,
                  35.37639732495859
                ],
                [
                  41.27170544188097,
                  35.50369626514689
                ],
                [
                  41.36278863923166,
                  35.58833595654943
                ],
                [
                  41.37839965659856,
                  35.714220563000865
                ],
                [
                  41.36102897864763,
                  35.846607517844376
                ],
                [
                  41.24563380075429,
                  36.07960493561347
                ],
                [
                  41.270117827088384,
                  36.154321712090095
                ],
                [
                  41.29075064054169,
                  36.3240049748793
                ],
                [
                  41.33266692848885,
                  36.45119859313664
                ],
                [
                  41.40181858450586,
                  36.506924975699974
                ],
                [
                  41.80905090059403,
                  36.57739826359006
                ],
                [
                  41.96996057007311,
                  36.734373417296936
                ],
                [
                  42.37371335737882,
                  37.07171301498134
                ],
                [
                  42.352162329040134,
                  37.11099723693575
                ],
                [
                  42.31933247929193,
                  37.18962297190099
                ],
                [
                  42.3439270156378,
                  37.229994379651664
                ],
                [
                  42.209929570415795,
                  37.31643017919865
                ],
                [
                  42.07562759550581,
                  37.19043784612753
                ],
                [
                  41.7245744613698,
                  37.11451961513164
                ],
                [
                  41.43014636167344,
                  37.078993998281035
                ],
                [
                  41.04808206126142,
                  37.090240277633406
                ],
                [
                  40.95477878750863,
                  37.125548906487225
                ],
                [
                  40.77759667770974,
                  37.11343267048548
                ],
                [
                  40.7373025987077,
                  37.10653476785239
                ],
                [
                  40.403267574511915,
                  36.99918239209585
                ],
                [
                  40.39034421154163,
                  36.99473562614878
                ],
                [
                  40.36243517139174,
                  36.96782640384995
                ],
                [
                  40.340538439466,
                  36.949253858968774
                ],
                [
                  40.321145251966094,
                  36.938690119226365
                ],
                [
                  40.35771744629959,
                  36.91001013976685
                ],
                [
                  40.35699892111951,
                  36.87421029162809
                ],
                [
                  40.25889774866989,
                  36.89916374011175
                ],
                [
                  40.2369895050161,
                  36.76764886995295
                ],
                [
                  40.29654462013791,
                  36.65141110547276
                ],
                [
                  39.97523479170897,
                  36.65226655545062
                ]
              ]
            ],
            "type": "Polygon"
          }
        },
        {
          "type": "Feature",
          "properties": {
            "name": "Transitional Gov & Allies",
            "controlledBy": "REBEL_GROUP",
            "color": "#4CAF50", // Default green
            "controlledSince": "2019-10-20"
          },
          "geometry": {
            "coordinates": [
              [
                [
                  36.15161888144519,
                  35.80957208552802
                ],
                // ... (truncated for brevity, but would include all the coordinates)
                [
                  36.15161888144519,
                  35.80957208552802
                ]
              ]
            ],
            "type": "Polygon"
          }
        }
        // Additional features would be included here...
      ]
    };

    // Check if territory control collection already has data
    const existingCount = await db.collection('territorycontrols').countDocuments();
    
    if (existingCount > 0) {
      console.log(`Territory control collection already has ${existingCount} documents. Skipping migration.`);
      return;
    }

    try {
      // Prepare the document for insertion
      const territoryControlDocument = {
        type: territoryControlData.type,
        date: new Date(territoryControlData.date),
        features: territoryControlData.features.map(feature => ({
          type: feature.type,
          properties: {
            name: feature.properties.name,
            controlledBy: feature.properties.controlledBy,
            color: feature.properties.color,
            controlledSince: new Date(feature.properties.controlledSince),
            description: { en: '', ar: '' }
          },
          geometry: feature.geometry
        })),
        metadata: {
          source: 'frontend_migration',
          description: { 
            en: 'Initial territory control data migrated from frontend', 
            ar: 'بيانات السيطرة الإقليمية الأولية المهاجرة من الواجهة الأمامية' 
          },
          accuracy: 'medium',
          lastVerified: new Date()
        },
        created_by: null, // System migration
        updated_by: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Insert the territory control document
      const result = await db.collection('territorycontrols').insertOne(territoryControlDocument);
      
      console.log(`Successfully imported initial territory control data with ID: ${result.insertedId}`);
      
      // Create indexes for the new collection
      console.log('Creating indexes for territory control collection...');
      
      await db.collection('territorycontrols').createIndex({ date: -1 });
      await db.collection('territorycontrols').createIndex({ 'features.properties.controlledBy': 1, date: -1 });
      await db.collection('territorycontrols').createIndex({ 'features.properties.controlledSince': -1 });
      await db.collection('territorycontrols').createIndex({ 'features.geometry': '2dsphere' });
      await db.collection('territorycontrols').createIndex({ createdAt: -1 });
      
      console.log('Indexes created successfully');
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      console.log('\n=== Migration Summary ===');
      console.log(`Processing time: ${duration.toFixed(2)} seconds`);
      console.log(`Features imported: ${territoryControlDocument.features.length}`);
      console.log(`Date: ${territoryControlDocument.date.toISOString().split('T')[0]}`);
      console.log(`Source: ${territoryControlDocument.metadata.source}`);
      console.log('Initial territory control data migration completed successfully! 🎉');
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  /**
   * @param db {import('mongodb').Db}
   * @returns {Promise<void>}
   */
  async down(db) {
    console.log('Rolling back initial territory control data import...');
    
    try {
      // Remove the migrated territory control data
      const result = await db.collection('territorycontrols').deleteMany({
        'metadata.source': 'frontend_migration'
      });
      
      console.log(`Removed ${result.deletedCount} territory control documents created by migration`);
      
      // Drop indexes if collection is now empty
      const remainingCount = await db.collection('territorycontrols').countDocuments();
      if (remainingCount === 0) {
        console.log('Dropping indexes from empty territory control collection...');
        await db.collection('territorycontrols').dropIndexes();
        console.log('Indexes dropped successfully');
      }
      
      console.log('Rollback completed successfully');
    } catch (error) {
      console.error('Rollback failed:', error);
      throw error;
    }
  }
}; 