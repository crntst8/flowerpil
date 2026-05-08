import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ImportModal from '../ImportModal.jsx';

// Mock PlatformIcon to avoid asset resolution issues
vi.mock('@shared/components/PlatformIcon', () => ({
  default: ({ platform, size }) => <span data-testid={`platform-icon-${platform}`}>{platform}</span>
}));

describe('ImportModal', () => {
  let mockAuthFetch;
  let mockOnImported;

  beforeEach(() => {
    mockOnImported = vi.fn();
    mockAuthFetch = vi.fn();
  });

  it('shows input stage by default with preview button', () => {
    render(<ImportModal isOpen={true} onImported={mockOnImported} />);
    expect(screen.getByPlaceholderText(/spotify\.com/i)).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('detects platform from pasted URL without auto-importing', () => {
    render(<ImportModal isOpen={true} onImported={mockOnImported} />);
    const input = screen.getByPlaceholderText(/spotify\.com/i);
    fireEvent.change(input, { target: { value: 'https://open.spotify.com/playlist/abc123' } });

    expect(screen.getByText(/Detected: Spotify/i)).toBeInTheDocument();
    // onImported should NOT have been called - no auto-import
    expect(mockOnImported).not.toHaveBeenCalled();
  });

  it('fetches preview on button click and shows summary card', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          platform: 'spotify',
          url: 'https://open.spotify.com/playlist/abc123',
          playlist: {
            title: 'Test Playlist',
            description: 'A test',
            image: 'https://example.com/img.jpg',
            trackCount: 25
          }
        }
      })
    });

    render(
      <ImportModal
        isOpen={true}
        onImported={mockOnImported}
        authenticatedFetch={mockAuthFetch}
      />
    );

    const input = screen.getByPlaceholderText(/spotify\.com/i);
    fireEvent.change(input, { target: { value: 'https://open.spotify.com/playlist/abc123' } });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() => {
      expect(screen.getByText('Test Playlist')).toBeInTheDocument();
    });

    expect(screen.getByText('25 tracks')).toBeInTheDocument();
    expect(screen.getByText('Append tracks')).toBeInTheDocument();
    expect(screen.getByText('Replace all tracks')).toBeInTheDocument();
    // onImported still not called - user hasn't confirmed
    expect(mockOnImported).not.toHaveBeenCalled();
  });

  it('calls onImported with mergeMode on confirm', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          platform: 'tidal',
          url: 'https://tidal.com/playlist/xyz',
          playlist: {
            title: 'TIDAL Mix',
            trackCount: 10
          }
        }
      })
    });

    render(
      <ImportModal
        isOpen={true}
        onImported={mockOnImported}
        authenticatedFetch={mockAuthFetch}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/spotify\.com/i), {
      target: { value: 'https://tidal.com/playlist/xyz' }
    });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() => {
      expect(screen.getByText('TIDAL Mix')).toBeInTheDocument();
    });

    // Select replace mode
    fireEvent.click(screen.getByText('Replace all tracks'));
    // Confirm import
    fireEvent.click(screen.getByText('Import'));

    expect(mockOnImported).toHaveBeenCalledTimes(1);
    expect(mockOnImported).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'tidal',
      url: 'https://tidal.com/playlist/xyz',
      title: 'TIDAL Mix',
      mergeMode: 'replace'
    }));
  });

  it('shows result panel with counts when importResult is provided', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          platform: 'spotify',
          url: 'https://open.spotify.com/playlist/done',
          playlist: { title: 'Done', trackCount: 5 }
        }
      })
    });

    const { rerender } = render(
      <ImportModal
        isOpen={true}
        onImported={mockOnImported}
        authenticatedFetch={mockAuthFetch}
      />
    );

    // Go through detect -> preview -> confirm
    fireEvent.change(screen.getByPlaceholderText(/spotify\.com/i), {
      target: { value: 'https://open.spotify.com/playlist/done' }
    });
    fireEvent.click(screen.getByText('Preview'));
    await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Import'));

    // Simulate import completing with result
    rerender(
      <ImportModal
        isOpen={true}
        onImported={mockOnImported}
        authenticatedFetch={mockAuthFetch}
        importResult={{ added: 12, skipped: 3, unmatched: 1 }}
      />
    );

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/added/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/skipped/)).toBeInTheDocument();
    expect(screen.getByText(/unmatched/)).toBeInTheDocument();
  });

  it('shows track preview toggle when tracks are available', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          platform: 'spotify',
          url: 'https://open.spotify.com/playlist/tracks123',
          playlist: { title: 'Tracks Preview', trackCount: 15 },
          tracks: [
            { title: 'Song One', artist: 'Artist A' },
            { title: 'Song Two', artist: 'Artist B' },
            { title: 'Song Three', artist: 'Artist C' },
          ]
        }
      })
    });

    render(
      <ImportModal
        isOpen={true}
        onImported={mockOnImported}
        authenticatedFetch={mockAuthFetch}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/spotify\.com/i), {
      target: { value: 'https://open.spotify.com/playlist/tracks123' }
    });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() => {
      expect(screen.getByText('Tracks Preview')).toBeInTheDocument();
    });

    // Track preview toggle should be visible
    const toggle = screen.getByText(/show track preview/i);
    expect(toggle).toBeInTheDocument();

    // Click to expand
    fireEvent.click(toggle);

    // Should show track details
    expect(screen.getByText(/Song One/)).toBeInTheDocument();
    expect(screen.getByText(/Artist A/)).toBeInTheDocument();
    expect(screen.getByText(/Song Two/)).toBeInTheDocument();
    // Should show "+ more" indicator since trackCount (15) > tracks shown (3)
    expect(screen.getByText(/\+ 12 more tracks/)).toBeInTheDocument();
  });

  it('returns null when not open', () => {
    const { container } = render(
      <ImportModal isOpen={false} onImported={mockOnImported} />
    );
    expect(container.innerHTML).toBe('');
  });
});
