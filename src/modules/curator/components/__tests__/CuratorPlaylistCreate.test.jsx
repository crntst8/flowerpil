import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for the draft locking pattern used in CuratorPlaylistCreate.
 *
 * The ensureDraft function uses a promise-ref lock to prevent concurrent
 * draft creation. This test validates the lock behavior in isolation.
 */
describe('ensureDraft promise-ref lock pattern', () => {
  it('concurrent calls resolve to a single draft', async () => {
    const persistPlaylist = vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ id: 42, title: 'Draft' }), 50))
    );

    // Simulate the lock pattern from CuratorPlaylistCreate
    let draftPromise = null;
    const ensureDraft = async (prefill = {}) => {
      if (draftPromise) return draftPromise;
      const promise = (async () => {
        const draft = await persistPlaylist({ ...prefill, published: false });
        return draft;
      })();
      draftPromise = promise;
      try {
        return await promise;
      } finally {
        draftPromise = null;
      }
    };

    // Fire three concurrent calls
    const [a, b, c] = await Promise.all([
      ensureDraft({ title: 'A' }),
      ensureDraft({ title: 'B' }),
      ensureDraft({ title: 'C' })
    ]);

    // All should resolve to the same draft
    expect(a).toEqual({ id: 42, title: 'Draft' });
    expect(b).toEqual({ id: 42, title: 'Draft' });
    expect(c).toEqual({ id: 42, title: 'Draft' });

    // persistPlaylist should only have been called once
    expect(persistPlaylist).toHaveBeenCalledTimes(1);
  });

  it('allows a new draft after the first one completes', async () => {
    let callCount = 0;
    const persistPlaylist = vi.fn().mockImplementation(
      () => new Promise(resolve => {
        callCount++;
        setTimeout(() => resolve({ id: callCount * 10, title: `Draft ${callCount}` }), 10);
      })
    );

    let draftPromise = null;
    const ensureDraft = async (prefill = {}) => {
      if (draftPromise) return draftPromise;
      const promise = (async () => {
        return await persistPlaylist({ ...prefill, published: false });
      })();
      draftPromise = promise;
      try {
        return await promise;
      } finally {
        draftPromise = null;
      }
    };

    const first = await ensureDraft({ title: 'First' });
    expect(first.id).toBe(10);

    // After first resolves, a second call should create a new draft
    const second = await ensureDraft({ title: 'Second' });
    expect(second.id).toBe(20);
    expect(persistPlaylist).toHaveBeenCalledTimes(2);
  });

  it('clears lock on error so subsequent calls can retry', async () => {
    let attempt = 0;
    const persistPlaylist = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) return Promise.reject(new Error('Network error'));
      return Promise.resolve({ id: 99, title: 'Recovered' });
    });

    let draftPromise = null;
    const ensureDraft = async (prefill = {}) => {
      if (draftPromise) return draftPromise;
      const promise = (async () => {
        return await persistPlaylist({ ...prefill, published: false });
      })();
      draftPromise = promise;
      try {
        return await promise;
      } finally {
        draftPromise = null;
      }
    };

    // First call fails
    await expect(ensureDraft({ title: 'Fail' })).rejects.toThrow('Network error');

    // Lock should be cleared, second call succeeds
    const result = await ensureDraft({ title: 'Retry' });
    expect(result.id).toBe(99);
    expect(persistPlaylist).toHaveBeenCalledTimes(2);
  });
});

describe('draft_session_id generation', () => {
  it('generates a valid UUID v4 string', () => {
    const id = crypto.randomUUID();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
