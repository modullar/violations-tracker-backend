// Manual mocks to avoid global setup dependencies
jest.mock('../../../models/Violation');
jest.mock('../../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

const mongoose = require('mongoose');
const {
  mergeViolations,
  mergeWithExistingViolation,
  mergeVictims,
  mergeMediaLinks,
  mergeTags,
  mergeLocalizedString,
  mergeLocation,
  mergeSourceUrls
} = require('../../../commands/violations/merge');
const Violation = require('../../../models/Violation');

describe('Violation Merge Service', () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('mergeLocalizedString', () => {
    it('should merge localized strings preferring non-empty values', () => {
      const target = { en: 'English text', ar: '' };
      const source = { en: '', ar: 'Arabic text' };

      const result = mergeLocalizedString(target, source);

      expect(result).toEqual({
        en: 'English text',
        ar: 'Arabic text'
      });
    });

    it('should handle empty objects', () => {
      const result = mergeLocalizedString({}, {});

      expect(result).toEqual({
        en: '',
        ar: ''
      });
    });

    it('should handle undefined inputs', () => {
      const result = mergeLocalizedString();

      expect(result).toEqual({
        en: '',
        ar: ''
      });
    });

    it('should prefer first argument when both have values', () => {
      const target = { en: 'First English', ar: 'First Arabic' };
      const source = { en: 'Second English', ar: 'Second Arabic' };

      const result = mergeLocalizedString(target, source);

      expect(result).toEqual({
        en: 'First English',
        ar: 'First Arabic'
      });
    });
  });

  describe('mergeSourceUrls', () => {
    it('should combine different source URLs with semicolon separator', () => {
      const targetSourceUrl = { 
        en: 'https://example.com/source1', 
        ar: 'https://example.ar/source1' 
      };
      const sourceSourceUrl = { 
        en: 'https://example.com/source2', 
        ar: 'https://example.ar/source2' 
      };

      const result = mergeSourceUrls(targetSourceUrl, sourceSourceUrl);

      expect(result).toEqual({
        en: 'https://example.com/source1; https://example.com/source2',
        ar: 'https://example.ar/source1; https://example.ar/source2'
      });
    });

    it('should not duplicate identical URLs', () => {
      const sourceUrl = { 
        en: 'https://example.com/same', 
        ar: 'https://example.ar/same' 
      };

      const result = mergeSourceUrls(sourceUrl, sourceUrl);

      expect(result).toEqual({
        en: 'https://example.com/same',
        ar: 'https://example.ar/same'
      });
    });

    it('should handle when only target has URLs', () => {
      const targetSourceUrl = { 
        en: 'https://example.com/target', 
        ar: 'https://example.ar/target' 
      };
      const sourceSourceUrl = { en: '', ar: '' };

      const result = mergeSourceUrls(targetSourceUrl, sourceSourceUrl);

      expect(result).toEqual({
        en: 'https://example.com/target',
        ar: 'https://example.ar/target'
      });
    });

    it('should handle when only source has URLs', () => {
      const targetSourceUrl = { en: '', ar: '' };
      const sourceSourceUrl = { 
        en: 'https://example.com/source', 
        ar: 'https://example.ar/source' 
      };

      const result = mergeSourceUrls(targetSourceUrl, sourceSourceUrl);

      expect(result).toEqual({
        en: 'https://example.com/source',
        ar: 'https://example.ar/source'
      });
    });

    it('should handle mixed language scenarios', () => {
      const targetSourceUrl = { 
        en: 'https://example.com/english', 
        ar: '' 
      };
      const sourceSourceUrl = { 
        en: '', 
        ar: 'https://example.ar/arabic' 
      };

      const result = mergeSourceUrls(targetSourceUrl, sourceSourceUrl);

      expect(result).toEqual({
        en: 'https://example.com/english',
        ar: 'https://example.ar/arabic'
      });
    });

    it('should handle empty objects', () => {
      const result = mergeSourceUrls({}, {});

      expect(result).toEqual({
        en: '',
        ar: ''
      });
    });

    it('should handle undefined inputs', () => {
      const result = mergeSourceUrls();

      expect(result).toEqual({
        en: '',
        ar: ''
      });
    });

    it('should combine when one language differs and other is same', () => {
      const targetSourceUrl = { 
        en: 'https://example.com/same', 
        ar: 'https://example.ar/target' 
      };
      const sourceSourceUrl = { 
        en: 'https://example.com/same', 
        ar: 'https://example.ar/source' 
      };

      const result = mergeSourceUrls(targetSourceUrl, sourceSourceUrl);

      expect(result).toEqual({
        en: 'https://example.com/same',
        ar: 'https://example.ar/target; https://example.ar/source'
      });
    });
  });

  describe('mergeVictims', () => {
    it('should merge unique victims', () => {
      const targetVictims = [
        {
          age: 25,
          gender: 'male',
          status: 'civilian',
          group_affiliation: { en: 'Group A', ar: '' }
        }
      ];

      const sourceVictims = [
        {
          age: 30,
          gender: 'female',
          status: 'civilian',
          group_affiliation: { en: 'Group B', ar: '' }
        }
      ];

      const result = mergeVictims(targetVictims, sourceVictims);

      expect(result).toHaveLength(2);
      expect(result).toContain(targetVictims[0]);
      expect(result).toContain(sourceVictims[0]);
    });

    it('should not duplicate identical victims', () => {
      const victim = {
        age: 25,
        gender: 'male',
        status: 'civilian',
        group_affiliation: { en: 'Group A', ar: '' },
        sectarian_identity: { en: 'Identity A', ar: '' }
      };

      const targetVictims = [victim];
      const sourceVictims = [victim];

      const result = mergeVictims(targetVictims, sourceVictims);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(victim);
    });

    it('should handle empty arrays', () => {
      const targetVictims = [{ age: 25, gender: 'male', status: 'civilian' }];

      const result = mergeVictims(targetVictims, []);

      expect(result).toEqual(targetVictims);
    });

    it('should handle undefined inputs', () => {
      const result = mergeVictims();

      expect(result).toEqual([]);
    });
  });

  describe('mergeMediaLinks', () => {
    it('should merge unique media links', () => {
      const targetLinks = ['https://example.com/video1', 'https://example.com/video2'];
      const sourceLinks = ['https://example.com/video3', 'https://example.com/video1'];

      const result = mergeMediaLinks(targetLinks, sourceLinks);

      expect(result).toHaveLength(3);
      expect(result).toContain('https://example.com/video1');
      expect(result).toContain('https://example.com/video2');
      expect(result).toContain('https://example.com/video3');
    });

    it('should handle empty arrays', () => {
      const targetLinks = ['https://example.com/video1'];

      const result = mergeMediaLinks(targetLinks, []);

      expect(result).toEqual(targetLinks);
    });

    it('should handle undefined inputs', () => {
      const result = mergeMediaLinks();

      expect(result).toEqual([]);
    });
  });

  describe('mergeTags', () => {
    it('should merge unique tags based on English text', () => {
      const targetTags = [
        { en: 'civilian casualties', ar: 'ضحايا مدنيون' },
        { en: 'airstrike', ar: 'غارة جوية' }
      ];

      const sourceTags = [
        { en: 'war crime', ar: 'جريمة حرب' },
        { en: 'civilian casualties', ar: 'ضحايا مدنيون' } // Duplicate
      ];

      const result = mergeTags(targetTags, sourceTags);

      expect(result).toHaveLength(3);
      expect(result.some(tag => tag.en === 'civilian casualties')).toBe(true);
      expect(result.some(tag => tag.en === 'airstrike')).toBe(true);
      expect(result.some(tag => tag.en === 'war crime')).toBe(true);
    });

    it('should handle empty arrays', () => {
      const targetTags = [{ en: 'tag1', ar: '' }];

      const result = mergeTags(targetTags, []);

      expect(result).toEqual(targetTags);
    });

    it('should handle undefined inputs', () => {
      const result = mergeTags();

      expect(result).toEqual([]);
    });
  });

  describe('mergeViolations', () => {
    const baseExisting = {
      _id: 'existing-id',
      type: 'AIRSTRIKE',
      date: new Date('2023-06-15'),
      casualties: 3,
      victims: [{ age: 25, gender: 'male', status: 'civilian' }],
      media_links: ['https://example.com/video1'],
      tags: [{ en: 'airstrike', ar: 'غارة جوية' }],
      verified: false,
      certainty_level: 'possible',
      description: { en: 'Original description', ar: 'وصف أصلي' },
      source: { en: 'Original source', ar: 'مصدر أصلي' }
    };

    const baseNew = {
      type: 'AIRSTRIKE',
      date: new Date('2023-06-15'),
      casualties: 5,
      victims: [{ age: 30, gender: 'female', status: 'civilian' }],
      media_links: ['https://example.com/video2'],
      tags: [{ en: 'war crime', ar: 'جريمة حرب' }],
      verified: true,
      certainty_level: 'confirmed',
      description: { en: 'New description', ar: 'وصف جديد' },
      source: { en: 'New source', ar: 'مصدر جديد' }
    };

    it('should merge violations with preferNew=true', () => {
      const result = mergeViolations(baseNew, baseExisting, { preferNew: true });

      // Should prefer new data for most fields
      expect(result.type).toBe(baseNew.type);
      expect(result.date).toBe(baseNew.date);
      expect(result.verified).toBe(true); // Should prefer verified status
      expect(result.certainty_level).toBe('confirmed'); // Should use higher certainty
      expect(result.casualties).toBe(5); // Should take maximum
      
      // Should merge arrays
      expect(result.victims).toHaveLength(2);
      expect(result.media_links).toHaveLength(2);
      expect(result.tags).toHaveLength(2);
    });

    it('should merge arrays correctly', () => {
      const result = mergeViolations(baseNew, baseExisting);

      expect(result.victims).toHaveLength(2);
      expect(result.media_links).toContain('https://example.com/video1');
      expect(result.media_links).toContain('https://example.com/video2');
      expect(result.tags.some(tag => tag.en === 'airstrike')).toBe(true);
      expect(result.tags.some(tag => tag.en === 'war crime')).toBe(true);
    });

    it('should take maximum of numeric counts', () => {
      const newViolation = {
        casualties: 3,
        kidnapped_count: 2,
        detained_count: 5,
        injured_count: 1,
        displaced_count: 10
      };

      const existingViolation = {
        casualties: 7,
        kidnapped_count: 1,
        detained_count: 3,
        injured_count: 4,
        displaced_count: 8
      };

      const result = mergeViolations(newViolation, existingViolation);

      expect(result.casualties).toBe(7);
      expect(result.kidnapped_count).toBe(2);
      expect(result.detained_count).toBe(5);
      expect(result.injured_count).toBe(4);
      expect(result.displaced_count).toBe(10);
    });

    it('should prefer verified status', () => {
      const newViolation = { verified: false };
      const existingViolation = { verified: true };

      const result = mergeViolations(newViolation, existingViolation);

      expect(result.verified).toBe(true);
    });

    it('should use higher certainty level', () => {
      const tests = [
        { new: 'possible', existing: 'probable', expected: 'probable' },
        { new: 'confirmed', existing: 'possible', expected: 'confirmed' },
        { new: 'probable', existing: 'confirmed', expected: 'confirmed' }
      ];

      tests.forEach(test => {
        const result = mergeViolations(
          { certainty_level: test.new },
          { certainty_level: test.existing }
        );
        expect(result.certainty_level).toBe(test.expected);
      });
    });

    it('should update casualty count based on victims with death dates', () => {
      const newViolation = {
        casualties: 2,
        victims: [
          { age: 25, death_date: new Date('2023-06-15') },
          { age: 30, death_date: new Date('2023-06-15') },
          { age: 35, death_date: new Date('2023-06-15') }
        ]
      };

      const existingViolation = { casualties: 1, victims: [] };

      const result = mergeViolations(newViolation, existingViolation);

      expect(result.casualties).toBe(3); // Should be updated to match death count
    });

    it('should update timestamp when requested', () => {
      const result = mergeViolations(baseNew, baseExisting, { updateTimestamp: true });

      expect(result.updatedAt).toBeDefined();
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should merge source URLs together instead of keeping only the old one', () => {
      const existingViolation = {
        type: 'AIRSTRIKE',
        source_url: {
          en: 'https://example.com/existing-source',
          ar: 'https://example.ar/existing-source'
        }
      };

      const newViolationData = {
        type: 'AIRSTRIKE',
        source_url: {
          en: 'https://example.com/new-source',
          ar: 'https://example.ar/new-source'
        }
      };

      const result = mergeViolations(newViolationData, existingViolation);

      expect(result.source_url).toEqual({
        en: 'https://example.com/existing-source; https://example.com/new-source',
        ar: 'https://example.ar/existing-source; https://example.ar/new-source'
      });
    });

    it('should handle source URLs when only one violation has them', () => {
      const existingViolation = {
        type: 'AIRSTRIKE',
        source_url: {
          en: 'https://example.com/existing-only',
          ar: ''
        }
      };

      const newViolationData = {
        type: 'AIRSTRIKE'
        // No source_url
      };

      const result = mergeViolations(newViolationData, existingViolation);

      expect(result.source_url).toEqual({
        en: 'https://example.com/existing-only',
        ar: ''
      });
    });

    it('should not duplicate identical source URLs', () => {
      const sourceUrl = {
        en: 'https://example.com/same-source',
        ar: 'https://example.ar/same-source'
      };

      const existingViolation = {
        type: 'AIRSTRIKE',
        source_url: sourceUrl
      };

      const newViolationData = {
        type: 'AIRSTRIKE',
        source_url: sourceUrl
      };

      const result = mergeViolations(newViolationData, existingViolation);

      expect(result.source_url).toEqual({
        en: 'https://example.com/same-source',
        ar: 'https://example.ar/same-source'
      });
    });
  });

  describe('mergeLocation', () => {
    it('should preserve coordinates from existing location', () => {
      const existingLocation = {
        name: { en: 'Damascus', ar: 'دمشق' },
        coordinates: [36.2021047, 33.5138073]
      };
      
      const newLocation = {
        name: { en: 'Damascus Updated', ar: 'دمشق المحدثة' },
        administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
        // Note: no coordinates in new data
      };

      const result = mergeLocation(existingLocation, newLocation);

      expect(result.coordinates).toEqual([36.2021047, 33.5138073]);
      expect(result.name.en).toBe('Damascus');
      expect(result.administrative_division.en).toBe('Damascus Governorate');
    });

    it('should handle missing coordinates gracefully', () => {
      const existingLocation = {
        name: { en: 'Location 1', ar: 'الموقع 1' }
        // No coordinates
      };
      
      const newLocation = {
        name: { en: 'Location 2', ar: 'الموقع 2' },
        administrative_division: { en: 'Region', ar: 'منطقة' }
      };

      const result = mergeLocation(existingLocation, newLocation);

      expect(result.coordinates).toBeUndefined();
      expect(result.name.en).toBe('Location 1');
      expect(result.administrative_division.en).toBe('Region');
    });
  });

  describe('mergeViolations - location handling', () => {
    it('should preserve coordinates during violation merge', () => {
      const existingViolation = {
        type: 'AIRSTRIKE',
        location: {
          name: { en: 'Damascus', ar: 'دمشق' },
          coordinates: [36.2021047, 33.5138073]
        },
        casualties: 3
      };

      const newViolationData = {
        type: 'AIRSTRIKE',
        location: {
          name: { en: 'Damascus Updated', ar: 'دمشق المحدثة' },
          administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
          // Note: no coordinates in new data
        },
        casualties: 5
      };

      const result = mergeViolations(newViolationData, existingViolation);

      expect(result.location.coordinates).toEqual([36.2021047, 33.5138073]);
      expect(result.location.administrative_division.en).toBe('Damascus Governorate');
      expect(result.casualties).toBe(5);
    });
  });

  describe('mergeWithExistingViolation', () => {
    const mockExistingViolation = {
      _id: 'existing-id',
      type: 'AIRSTRIKE',
      casualties: 3,
      verified: false
    };

    const mockNewViolationData = {
      type: 'AIRSTRIKE',
      casualties: 5,
      verified: true
    };

    beforeEach(() => {
      Violation.findByIdAndUpdate = jest.fn();
    });

    it('should merge and update violation in database', async () => {
      const mockUpdatedViolation = {
        ...mockExistingViolation,
        ...mockNewViolationData,
        updated_by: mockUserId
      };

      Violation.findByIdAndUpdate.mockResolvedValue(mockUpdatedViolation);

      const result = await mergeWithExistingViolation(
        mockNewViolationData,
        mockExistingViolation,
        mockUserId
      );

      expect(Violation.findByIdAndUpdate).toHaveBeenCalledWith(
        'existing-id',
        expect.objectContaining({
          updated_by: mockUserId,
          casualties: 5,
          verified: true
        }),
        { new: true, runValidators: true }
      );

      expect(result).toEqual(mockUpdatedViolation);
    });

    it('should handle database errors', async () => {
      Violation.findByIdAndUpdate.mockRejectedValue(new Error('Database error'));

      await expect(mergeWithExistingViolation(
        mockNewViolationData,
        mockExistingViolation,
        mockUserId
      )).rejects.toThrow('Failed to merge violation: Database error');
    });

    it('should pass through merge options', async () => {
      const mockUpdatedViolation = { ...mockExistingViolation };
      Violation.findByIdAndUpdate.mockResolvedValue(mockUpdatedViolation);

      await mergeWithExistingViolation(
        mockNewViolationData,
        mockExistingViolation,
        mockUserId,
        { preferNew: false }
      );

      expect(Violation.findByIdAndUpdate).toHaveBeenCalled();
    });
  });
});
