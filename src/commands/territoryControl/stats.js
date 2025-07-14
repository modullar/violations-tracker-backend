const TerritoryControl = require('../../models/TerritoryControl');

/**
 * Get comprehensive territory control statistics
 * @returns {Promise<Object>} - Statistics object
 */
const getTerritoryControlStats = async () => {
  // Get total territory control records
  const totalRecords = await TerritoryControl.countDocuments();

  // Get date range
  const dateRange = await TerritoryControl.aggregate([
    {
      $group: {
        _id: null,
        earliestDate: { $min: '$date' },
        latestDate: { $max: '$date' }
      }
    }
  ]);

  // Count by controller across all records
  const controllerStats = await TerritoryControl.aggregate([
    { $unwind: '$features' },
    {
      $group: {
        _id: '$features.properties.controlledBy',
        count: { $sum: 1 },
        territories: { $addToSet: '$features.properties.name' }
      }
    },
    {
      $project: {
        controller: '$_id',
        featureCount: '$count',
        uniqueTerritories: { $size: '$territories' },
        territories: '$territories'
      }
    },
    { $sort: { featureCount: -1 } }
  ]);

  // Count records by year
  const yearlyStats = await TerritoryControl.aggregate([
    {
      $project: {
        year: { $year: '$date' },
        featuresCount: { $size: '$features' }
      }
    },
    {
      $group: {
        _id: '$year',
        recordsCount: { $sum: 1 },
        totalFeatures: { $sum: '$featuresCount' }
      }
    },
    { $sort: { _id: -1 } }
  ]);

  // Get source statistics
  const sourceStats = await TerritoryControl.aggregate([
    {
      $group: {
        _id: '$metadata.source',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Get accuracy statistics
  const accuracyStats = await TerritoryControl.aggregate([
    {
      $group: {
        _id: '$metadata.accuracy',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Get most recent territory control
  const mostRecent = await TerritoryControl.findOne({})
    .sort({ date: -1 })
    .select('date features.length');

  return {
    summary: {
      totalRecords,
      dateRange: dateRange[0] || { earliestDate: null, latestDate: null },
      mostRecentDate: mostRecent?.date || null,
      totalFeatures: mostRecent?.features?.length || 0
    },
    controllers: controllerStats,
    timeline: yearlyStats,
    sources: sourceStats,
    accuracy: accuracyStats
  };
};

/**
 * Get controller statistics for a specific date or date range
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Controller statistics
 */
const getControllerStats = async (options = {}) => {
  const query = {};

  // Filter by date or date range
  if (options.date) {
    query.date = new Date(options.date);
  } else if (options.startDate || options.endDate) {
    query.date = {};
    if (options.startDate) query.date.$gte = new Date(options.startDate);
    if (options.endDate) query.date.$lte = new Date(options.endDate);
  }

  const stats = await TerritoryControl.aggregate([
    { $match: query },
    { $unwind: '$features' },
    {
      $group: {
        _id: {
          controller: '$features.properties.controlledBy',
          date: '$date'
        },
        territories: { $push: '$features.properties.name' },
        colors: { $addToSet: '$features.properties.color' },
        controlledSince: { $min: '$features.properties.controlledSince' }
      }
    },
    {
      $group: {
        _id: '$_id.controller',
        records: {
          $push: {
            date: '$_id.date',
            territories: '$territories',
            territoriesCount: { $size: '$territories' }
          }
        },
        totalTerritories: { $sum: { $size: '$territories' } },
        colors: { $first: '$colors' },
        earliestControl: { $min: '$controlledSince' }
      }
    },
    {
      $project: {
        controller: '$_id',
        records: '$records',
        totalTerritories: '$totalTerritories',
        colors: '$colors',
        earliestControl: '$earliestControl'
      }
    },
    { $sort: { totalTerritories: -1 } }
  ]);

  return {
    query: options,
    controllers: stats,
    summary: {
      totalControllers: stats.length,
      totalTerritories: stats.reduce((sum, controller) => sum + controller.totalTerritories, 0)
    }
  };
};

/**
 * Get territory control timeline
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Timeline data
 */
const getTerritoryTimeline = async (options = {}) => {
  const query = {};
  
  // Filter by date range if provided
  if (options.startDate || options.endDate) {
    query.date = {};
    if (options.startDate) query.date.$gte = new Date(options.startDate);
    if (options.endDate) query.date.$lte = new Date(options.endDate);
  }

  // Filter by controller if provided
  if (options.controlledBy) {
    query['features.properties.controlledBy'] = options.controlledBy;
  }

  const timeline = await TerritoryControl.find(query)
    .select('date features metadata.source')
    .sort({ date: -1 })
    .limit(options.limit || 100);

  // Process timeline data
  const processedTimeline = timeline.map(record => ({
    date: record.date,
    featuresCount: record.features.length,
    controllers: [...new Set(record.features.map(f => f.properties.controlledBy))],
    source: record.metadata.source,
    territories: record.features.map(f => ({
      name: f.properties.name,
      controlledBy: f.properties.controlledBy,
      controlledSince: f.properties.controlledSince
    }))
  }));

  return {
    timeline: processedTimeline,
    summary: {
      recordsCount: timeline.length,
      dateRange: {
        start: timeline[timeline.length - 1]?.date || null,
        end: timeline[0]?.date || null
      }
    }
  };
};

/**
 * Get control changes summary between dates
 * @param {String|Date} startDate - Start date
 * @param {String|Date} endDate - End date
 * @returns {Promise<Object>} - Control changes summary
 */
const getControlChangesSummary = async (startDate, endDate) => {
  const startControl = await TerritoryControl.findByDate(startDate);
  const endControl = await TerritoryControl.findByDate(endDate);

  if (!startControl || !endControl) {
    return {
      hasData: false,
      message: 'Insufficient data for comparison',
      availableDates: await TerritoryControl.getAvailableDates()
    };
  }

  // Analyze changes
  const startControllers = new Map();
  const endControllers = new Map();

  // Build controller maps with territory counts
  startControl.features.forEach(feature => {
    const controller = feature.properties.controlledBy;
    if (!startControllers.has(controller)) {
      startControllers.set(controller, { count: 0, territories: [] });
    }
    startControllers.get(controller).count++;
    startControllers.get(controller).territories.push(feature.properties.name);
  });

  endControl.features.forEach(feature => {
    const controller = feature.properties.controlledBy;
    if (!endControllers.has(controller)) {
      endControllers.set(controller, { count: 0, territories: [] });
    }
    endControllers.get(controller).count++;
    endControllers.get(controller).territories.push(feature.properties.name);
  });

  // Calculate changes
  const changes = [];
  const allControllers = new Set([...startControllers.keys(), ...endControllers.keys()]);

  allControllers.forEach(controller => {
    const startData = startControllers.get(controller) || { count: 0, territories: [] };
    const endData = endControllers.get(controller) || { count: 0, territories: [] };
    
    const change = endData.count - startData.count;
    
    if (change !== 0) {
      changes.push({
        controller,
        startCount: startData.count,
        endCount: endData.count,
        change,
        changeType: change > 0 ? 'gained' : 'lost',
        startTerritories: startData.territories,
        endTerritories: endData.territories
      });
    }
  });

  // Sort by absolute change (largest changes first)
  changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return {
    hasData: true,
    period: {
      startDate: startControl.date,
      endDate: endControl.date,
      daysDifference: Math.ceil((endControl.date - startControl.date) / (1000 * 60 * 60 * 24))
    },
    summary: {
      totalFeaturesStart: startControl.features.length,
      totalFeaturesEnd: endControl.features.length,
      totalChange: endControl.features.length - startControl.features.length,
      controllersStart: startControllers.size,
      controllersEnd: endControllers.size,
      changesCount: changes.length
    },
    changes,
    newControllers: Array.from(endControllers.keys()).filter(c => !startControllers.has(c)),
    lostControllers: Array.from(startControllers.keys()).filter(c => !endControllers.has(c))
  };
};

/**
 * Get territorial distribution statistics
 * @param {String|Date} date - Date for the analysis
 * @returns {Promise<Object>} - Distribution statistics
 */
const getTerritorialDistribution = async (date) => {
  const territoryControl = await TerritoryControl.findByDate(date);

  if (!territoryControl) {
    return {
      hasData: false,
      message: 'No territory control data found for the specified date',
      availableDates: await TerritoryControl.getAvailableDates()
    };
  }

  // Analyze distribution
  const distribution = new Map();
  let totalFeatures = territoryControl.features.length;

  territoryControl.features.forEach(feature => {
    const controller = feature.properties.controlledBy;
    if (!distribution.has(controller)) {
      distribution.set(controller, {
        count: 0,
        percentage: 0,
        territories: [],
        colors: new Set()
      });
    }
    
    const data = distribution.get(controller);
    data.count++;
    data.territories.push({
      name: feature.properties.name,
      controlledSince: feature.properties.controlledSince
    });
    data.colors.add(feature.properties.color);
  });

  // Calculate percentages and convert to array
  const distributionArray = Array.from(distribution.entries()).map(([controller, data]) => ({
    controller,
    count: data.count,
    percentage: ((data.count / totalFeatures) * 100).toFixed(2),
    territories: data.territories,
    colors: Array.from(data.colors)
  }));

  // Sort by count (descending)
  distributionArray.sort((a, b) => b.count - a.count);

  return {
    hasData: true,
    date: territoryControl.date,
    summary: {
      totalFeatures,
      controllersCount: distributionArray.length,
      dominantController: distributionArray[0]?.controller || null,
      dominantControllerPercentage: distributionArray[0]?.percentage || 0
    },
    distribution: distributionArray
  };
};

module.exports = {
  getTerritoryControlStats,
  getControllerStats,
  getTerritoryTimeline,
  getControlChangesSummary,
  getTerritorialDistribution
}; 