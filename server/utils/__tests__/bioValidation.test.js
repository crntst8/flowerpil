import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_THEME } from '../../../src/shared/constants/bioThemes.js';
import {
  checkHandleAvailability,
  sanitizeBioProfileData,
  suggestHandles,
  validateHandle
} from '../bioValidation.js';

const createQueries = ({
  existingHandle = null,
  reservation = null,
  handleResponses = {}
} = {}) => ({
  checkHandleAvailability: {
    get: vi.fn((handle) => {
      if (Object.prototype.hasOwnProperty.call(handleResponses, handle)) {
        return handleResponses[handle];
      }
      return handle === existingHandle ? { id: 1 } : null;
    })
  },
  getHandleReservationByHandle: {
    get: vi.fn((handle) => {
      if (reservation && reservation.handle === handle) {
        return reservation.value;
      }
      return null;
    })
  }
});

describe('bioValidation', () => {
  describe('validateHandle', () => {
    it('normalizes whitespace and casing before reserved-handle validation', () => {
      const result = validateHandle('  Admin  ');

      expect(result).toEqual({
        isValid: false,
        errors: ['This handle is reserved and cannot be used'],
        handle: 'admin'
      });
    });
  });

  describe('checkHandleAvailability', () => {
    it('blocks unexpired reservations even when no profile owns the handle yet', async () => {
      const queries = createQueries({
        reservation: {
          handle: 'dj-set',
          value: {
            status: 'reserved',
            expires_at: '2099-01-01T00:00:00.000Z'
          }
        }
      });

      await expect(checkHandleAvailability('DJ-SET', queries)).resolves.toEqual({
        available: false,
        reason: 'reserved',
        handle: 'dj-set'
      });
    });

    it('treats expired reservations as available', async () => {
      const queries = createQueries({
        reservation: {
          handle: 'dj-set',
          value: {
            status: 'reserved',
            expires_at: '2000-01-01T00:00:00.000Z'
          }
        }
      });

      await expect(checkHandleAvailability('DJ-SET', queries)).resolves.toEqual({
        available: true,
        handle: 'dj-set'
      });
    });
  });

  describe('suggestHandles', () => {
    it('skips unavailable candidates and returns the first available alternatives', async () => {
      const queries = createQueries({
        handleResponses: {
          'djmix': { id: 1 },
          'djmix-music': { id: 2 },
          'djmix-official': null,
          'djmix-2025': null,
          'djmix-bio': null,
          'djmix-page': null
        }
      });

      await expect(suggestHandles('DJ Mix', queries)).resolves.toEqual([
        'djmix-official',
        'djmix-2025',
        'djmix-bio',
        'djmix-page',
        'djmix2'
      ]);
    });
  });

  describe('sanitizeBioProfileData', () => {
    it('preserves valid core custom colors and falls back invalid optional colors to theme defaults', () => {
      const sanitized = sanitizeBioProfileData({
        handle: '  MyHandle  ',
        curator_id: '42',
        is_published: true,
        version_number: 0,
        theme_settings: {
          paletteId: 'custom-palette',
          customColors: {
            background: '#ffffff',
            text: '#111111',
            border: '#222222',
            accent: 'not-a-color',
            link: 'still-not-a-color',
            featuredLinkBg: 'bad-value'
          }
        }
      });

      expect(sanitized).toMatchObject({
        handle: 'myhandle',
        curator_id: 42,
        is_published: 1,
        version_number: 1
      });

      expect(JSON.parse(sanitized.theme_settings)).toEqual({
        paletteId: 'custom-palette',
        customColors: {
          background: '#ffffff',
          text: '#111111',
          border: '#222222',
          accent: DEFAULT_THEME.accent,
          link: DEFAULT_THEME.link,
          featuredLinkBg: DEFAULT_THEME.featuredLinkBg
        }
      });
    });

    it('caps featured links and normalizes playlist links into publishable content', () => {
      const sanitized = sanitizeBioProfileData({
        draft_content: {
          featuredLinks: [
            {
              position: '2',
              link_type: 'playlist',
              playlist_id: '42',
              title: ' Playlist Link ',
              description: ' Primary list ',
              url: '',
              image_url: ' https://cdn.example.com/cover.jpg ',
              is_enabled: true
            },
            {
              position: '3',
              link_type: 'playlist',
              title: 'Incomplete playlist selection',
              url: 'https://example.com/fallback'
            },
            ...Array.from({ length: 8 }, (_, index) => ({
              position: index + 4,
              title: `Link ${index + 3}`,
              url: `https://example.com/${index + 3}`
            }))
          ]
        }
      });

      const { featuredLinks } = JSON.parse(sanitized.draft_content);

      expect(featuredLinks).toHaveLength(9);
      expect(featuredLinks[0]).toEqual({
        position: 2,
        link_type: 'playlist',
        title: 'Playlist Link',
        description: 'Primary list',
        is_enabled: true,
        playlist_id: 42,
        url: '/playlists/42',
        image_url: 'https://cdn.example.com/cover.jpg'
      });
      expect(featuredLinks[1]).toEqual({
        position: 3,
        link_type: 'url',
        title: 'Incomplete playlist selection',
        description: '',
        is_enabled: true,
        url: 'https://example.com/fallback',
        image_url: null
      });
      expect(featuredLinks.at(-1).title).toBe('Link 9');
    });
  });
});
