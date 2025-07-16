const { 
  territoryControlColors, 
  getColorForController, 
  addColorsToTerritoryControl 
} = require('../../config/territorColorMapping');

describe('Territory Control Color Mapping', () => {
  describe('territoryControlColors', () => {
    it('should have colors for all supported controllers', () => {
      const expectedControllers = [
        'assad_regime', 'post_8th_december_government', 'GOVERNMENT', 'REBEL_GROUP',
        'sdf', 'FOREIGN_MILITARY', 'isis', 'TERRORIST_ORGANIZATION', 'various_armed_groups',
        'israel', 'turkey', 'druze_militias', 'russia', 'iran_shia_militias', 
        'international_coalition', 'unknown'
      ];

      expectedControllers.forEach(controller => {
        expect(territoryControlColors).toHaveProperty(controller);
        expect(territoryControlColors[controller]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });

    it('should have valid hex colors', () => {
      Object.values(territoryControlColors).forEach(color => {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe('getColorForController', () => {
    it('should return correct color for known controllers', () => {
      expect(getColorForController('assad_regime')).toBe('#ff0000');
      expect(getColorForController('sdf')).toBe('#FFFF00');
      expect(getColorForController('israel')).toBe('#0000FF');
      expect(getColorForController('turkey')).toBe('#00FF00');
    });

    it('should return unknown color for unknown controllers', () => {
      expect(getColorForController('non_existent')).toBe('#800080');
      expect(getColorForController('')).toBe('#800080');
      expect(getColorForController(null)).toBe('#800080');
      expect(getColorForController(undefined)).toBe('#800080');
    });
  });

  describe('addColorsToTerritoryControl', () => {
    it('should add colors to territory control features', () => {
      const territoryControl = {
        type: 'FeatureCollection',
        date: '2023-01-01',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Test Territory 1',
              controlledBy: 'assad_regime',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          },
          {
            type: 'Feature',
            properties: {
              name: 'Test Territory 2',
              controlledBy: 'sdf',
              controlledSince: '2019-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[36.0, 36.0], [37.0, 36.0], [37.0, 37.0], [36.0, 37.0], [36.0, 36.0]]]
            }
          }
        ]
      };

      const result = addColorsToTerritoryControl(territoryControl);

      expect(result.features[0].properties.color).toBe('#ff0000'); // assad_regime
      expect(result.features[1].properties.color).toBe('#FFFF00'); // sdf
    });

    it('should handle features with unknown controllers', () => {
      const territoryControl = {
        type: 'FeatureCollection',
        date: '2023-01-01',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Test Territory',
              controlledBy: 'unknown_controller',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          }
        ]
      };

      const result = addColorsToTerritoryControl(territoryControl);

      expect(result.features[0].properties.color).toBe('#800080'); // unknown color
    });

    it('should not modify the original object', () => {
      const territoryControl = {
        type: 'FeatureCollection',
        date: '2023-01-01',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Test Territory',
              controlledBy: 'assad_regime',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          }
        ]
      };

      const result = addColorsToTerritoryControl(territoryControl);

      expect(result).not.toBe(territoryControl);
      expect(result.features[0]).not.toBe(territoryControl.features[0]);
      expect(result.features[0].properties).not.toBe(territoryControl.features[0].properties);
      expect(territoryControl.features[0].properties.color).toBeUndefined();
    });

    it('should handle null or undefined input', () => {
      expect(addColorsToTerritoryControl(null)).toBeNull();
      expect(addColorsToTerritoryControl(undefined)).toBeUndefined();
    });

    it('should handle territory control without features', () => {
      const territoryControl = {
        type: 'FeatureCollection',
        date: '2023-01-01'
      };

      const result = addColorsToTerritoryControl(territoryControl);

      expect(result).toEqual(territoryControl);
    });

    it('should handle features without properties', () => {
      const territoryControl = {
        type: 'FeatureCollection',
        date: '2023-01-01',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          }
        ]
      };

      const result = addColorsToTerritoryControl(territoryControl);

      expect(result.features[0].properties).toBeUndefined();
    });

    it('should preserve existing properties while adding color', () => {
      const territoryControl = {
        type: 'FeatureCollection',
        date: '2023-01-01',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Test Territory',
              controlledBy: 'assad_regime',
              controlledSince: '2020-01-01',
              customProperty: 'test_value'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          }
        ]
      };

      const result = addColorsToTerritoryControl(territoryControl);

      expect(result.features[0].properties.name).toBe('Test Territory');
      expect(result.features[0].properties.controlledBy).toBe('assad_regime');
      expect(result.features[0].properties.controlledSince).toBe('2020-01-01');
      expect(result.features[0].properties.customProperty).toBe('test_value');
      expect(result.features[0].properties.color).toBe('#ff0000');
    });
  });
}); 