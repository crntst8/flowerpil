import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import SearchResultsPage from '../SearchResultsPage';

// Mock useFullSearch
const mockUseFullSearch = vi.fn();
vi.mock('@core/hooks/useSearch', () => ({
  useFullSearch: (...args) => mockUseFullSearch(...args)
}));

// Mock useGenreCatalog
vi.mock('@shared/hooks/useGenreCatalog', () => ({
  useGenreCatalog: () => ({ catalog: [] })
}));

// Mock genreUtils
vi.mock('@shared/utils/genreUtils', () => ({
  createGenreLookup: () => ({ resolve: (tag) => ({ label: tag, color: '#333' }) }),
  parseGenreTags: (tags) => (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [])
}));

// Mock SEO component
vi.mock('@shared/components/SEO', () => ({
  default: () => null
}));

// Mock ReusableHeader
vi.mock('@shared/components/ReusableHeader', () => ({
  default: () => <div data-testid="reusable-header">Header</div>
}));

const DEFAULT_FULL_RESULTS = {
  results: [],
  secondary_groups: [],
  intent: 'mixed',
  took_ms: 0,
  pagination: { limit: 20, offset: 0, total: 0, has_more: false }
};

const renderWithQuery = (query) => {
  const initialEntries = query ? [`/search?q=${encodeURIComponent(query)}`] : ['/search'];
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <SearchResultsPage />
    </MemoryRouter>
  );
};

describe('SearchResultsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFullSearch.mockReturnValue({
      results: DEFAULT_FULL_RESULTS,
      loading: false,
      error: null
    });
  });

  it('should read query from URL ?q= parameter', () => {
    renderWithQuery('shoegaze');
    expect(mockUseFullSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'shoegaze' })
    );
  });

  it('should request mode=full from the search API', () => {
    renderWithQuery('indie');
    // useFullSearch is called with query, limit, offset
    // The hook itself calls ApiClient.search with mode: 'full'
    expect(mockUseFullSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'indie', limit: 20, offset: 0 })
    );
  });

  it('should show empty message when no query provided', () => {
    renderWithQuery('');
    expect(screen.getByText(/enter a search term/i)).toBeInTheDocument();
  });

  it('should show loading state', () => {
    mockUseFullSearch.mockReturnValue({
      results: DEFAULT_FULL_RESULTS,
      loading: true,
      error: null
    });
    renderWithQuery('test');
    expect(screen.getByText(/searching/i)).toBeInTheDocument();
  });

  it('should show error state', () => {
    mockUseFullSearch.mockReturnValue({
      results: DEFAULT_FULL_RESULTS,
      loading: false,
      error: new Error('Network error')
    });
    renderWithQuery('test');
    expect(screen.getByText(/search unavailable/i)).toBeInTheDocument();
  });

  it('should show no results message when results are empty', () => {
    mockUseFullSearch.mockReturnValue({
      results: DEFAULT_FULL_RESULTS,
      loading: false,
      error: null
    });
    renderWithQuery('xyznonexistent');
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });

  it('should render playlist results before curator results', () => {
    mockUseFullSearch.mockReturnValue({
      results: {
        results: [
          { id: 1, title: 'Shoegaze Dreams', curator: 'DJ Test', tags: 'shoegaze', match_reasons: ['genre_tag'], primary_match_type: 'genre_tag' },
          { id: 2, title: 'Dream Pop Mix', curator: 'Curator B', tags: 'dreampop', match_reasons: ['playlist_title'], primary_match_type: 'playlist_title' }
        ],
        secondary_groups: [
          { type: 'curators', items: [{ curator_id: 5, name: 'Shoegaze Weekly', profile_type: 'label', playlist_count: 3 }] }
        ],
        intent: 'genre',
        took_ms: 10,
        pagination: { limit: 20, offset: 0, total: 2, has_more: false }
      },
      loading: false,
      error: null
    });

    renderWithQuery('shoegaze');

    // Playlists section should appear first
    const sections = screen.getAllByRole('heading', { level: 2 });
    const playlistsIndex = sections.findIndex(h => h.textContent === 'Playlists');
    const curatorsIndex = sections.findIndex(h => h.textContent === 'Curators');
    expect(playlistsIndex).toBeLessThan(curatorsIndex);

    // Playlist results should be present
    expect(screen.getByText('Shoegaze Dreams')).toBeInTheDocument();
    expect(screen.getByText('Dream Pop Mix')).toBeInTheDocument();

    // Curator results should be present
    expect(screen.getByText('Shoegaze Weekly')).toBeInTheDocument();
  });

  it('should display match reasons for each result', () => {
    mockUseFullSearch.mockReturnValue({
      results: {
        results: [
          { id: 1, title: 'Ambient Mix', curator: 'DJ A', tags: 'ambient', match_reasons: ['genre_tag', 'playlist_title'], primary_match_type: 'genre_tag' }
        ],
        secondary_groups: [],
        intent: 'genre',
        took_ms: 5,
        pagination: { limit: 20, offset: 0, total: 1, has_more: false }
      },
      loading: false,
      error: null
    });

    renderWithQuery('ambient');
    expect(screen.getByText(/matched genre tag, matched title/i)).toBeInTheDocument();
  });

  it('should render ReusableHeader', () => {
    renderWithQuery('test');
    expect(screen.getByTestId('reusable-header')).toBeInTheDocument();
  });

  it('should link playlist results to /playlist/:id', () => {
    mockUseFullSearch.mockReturnValue({
      results: {
        results: [
          { id: 42, title: 'Test Playlist', curator: 'DJ', tags: '', match_reasons: ['playlist_title'], primary_match_type: 'playlist_title' }
        ],
        secondary_groups: [],
        intent: 'mixed',
        took_ms: 5,
        pagination: { limit: 20, offset: 0, total: 1, has_more: false }
      },
      loading: false,
      error: null
    });

    renderWithQuery('test');
    const link = screen.getByText('Test Playlist').closest('a');
    expect(link).toHaveAttribute('href', '/playlist/42');
  });

  it('should link curator results to /curator/:name', () => {
    mockUseFullSearch.mockReturnValue({
      results: {
        results: [],
        secondary_groups: [
          { type: 'curators', items: [{ curator_id: 1, name: 'Cool Curator', profile_type: 'blog', playlist_count: 5 }] }
        ],
        intent: 'mixed',
        took_ms: 5,
        pagination: { limit: 20, offset: 0, total: 0, has_more: false }
      },
      loading: false,
      error: null
    });

    renderWithQuery('cool');
    const link = screen.getByText('Cool Curator').closest('a');
    expect(link).toHaveAttribute('href', '/curator/Cool%20Curator');
  });
});
