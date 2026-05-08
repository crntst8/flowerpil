import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Track navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

// Stateful mock values
let mockQuery = '';
const mockSetQuery = vi.fn((val) => { mockQuery = val; });
let mockResults = { groups: [], intent: 'mixed', took_ms: 0 };
let mockLoading = false;

vi.mock('@core/hooks/useSearch', () => ({
  useSearch: () => ({
    query: mockQuery,
    setQuery: mockSetQuery,
    results: mockResults,
    loading: mockLoading,
    error: null,
    intent: mockResults.intent || 'mixed'
  }),
  default: () => ({
    query: mockQuery,
    setQuery: mockSetQuery,
    results: mockResults,
    loading: mockLoading,
    error: null,
    intent: mockResults.intent || 'mixed'
  })
}));

vi.mock('@core/hooks/useSearchSuggestions', () => ({
  useSearchSuggestions: () => ({ suggestions: [] })
}));

// Import AFTER mocks are set up
import SearchBar from '../SearchBar.jsx';

const renderSearchBar = () => {
  return render(
    <MemoryRouter>
      <SearchBar />
    </MemoryRouter>
  );
};

describe('SearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = '';
    mockResults = { groups: [], intent: 'mixed', took_ms: 0 };
    mockLoading = false;
  });

  it('should render the search input', () => {
    renderSearchBar();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('should call setQuery on input change', () => {
    renderSearchBar();
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'shoegaze' } });
    expect(mockSetQuery).toHaveBeenCalledWith('shoegaze');
  });

  it('should not navigate when query is empty and Enter is pressed', () => {
    renderSearchBar();
    const input = screen.getByRole('searchbox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should navigate to /search?q= on Enter when query has text and no arrow navigation', () => {
    mockQuery = 'ambient';
    renderSearchBar();
    const input = screen.getByRole('searchbox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/search?q=ambient');
  });

  it('should navigate to playlist on click-select of preview item', () => {
    mockQuery = 'test';
    mockResults = {
      groups: [
        {
          type: 'playlists_title',
          items: [
            { id: 42, playlist_id: 42, title: 'Test Playlist', subtitle: 'A test' }
          ]
        }
      ],
      intent: 'mixed',
      took_ms: 5
    };

    renderSearchBar();
    const input = screen.getByRole('searchbox');
    fireEvent.focus(input);

    const resultItem = screen.getByText('Test Playlist');
    fireEvent.mouseDown(resultItem);

    expect(mockNavigate).toHaveBeenCalledWith('/playlist/42');
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('/search?q='));
  });

  it('should select highlighted item on Enter after arrow navigation', () => {
    mockQuery = 'test';
    mockResults = {
      groups: [
        {
          type: 'playlists_title',
          items: [
            { id: 99, playlist_id: 99, title: 'Arrow Test', subtitle: 'Testing arrows' }
          ]
        }
      ],
      intent: 'mixed',
      took_ms: 5
    };

    renderSearchBar();
    const input = screen.getByRole('searchbox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/playlist/99');
  });
});
