import { describe, it, expect } from 'vitest';
import {
  canSyncInPlace,
  getExportActionLabel,
  hasSyncableSelection
} from '../exportHelpers';

describe('canSyncInPlace', () => {
  it('returns true for Spotify with active managed export and matching account', () => {
    const validation = {
      managedExport: { status: 'active', remote_playlist_id: 'abc123', account_type: 'flowerpil' }
    };
    expect(canSyncInPlace('spotify', validation, 'flowerpil')).toBe(true);
  });

  it('returns true for TIDAL with active managed export and matching account', () => {
    const validation = {
      managedExport: {
        status: 'active',
        remote_playlist_id: 'xyz',
        account_type: 'curator',
        owner_curator_id: 42
      }
    };
    expect(canSyncInPlace('tidal', validation, 'curator', 42)).toBe(true);
  });

  it('returns false for Apple even with active managed export', () => {
    const validation = {
      managedExport: { status: 'active', remote_playlist_id: 'p.abc', account_type: 'flowerpil' }
    };
    expect(canSyncInPlace('apple', validation, 'flowerpil')).toBe(false);
  });

  it('returns false for YouTube Music even with active managed export', () => {
    const validation = {
      managedExport: { status: 'active', remote_playlist_id: 'PLxyz', account_type: 'flowerpil' }
    };
    expect(canSyncInPlace('youtube_music', validation, 'flowerpil')).toBe(false);
  });

  it('returns false when account type does not match managed export owner', () => {
    const validation = {
      managedExport: { status: 'active', remote_playlist_id: 'abc', account_type: 'flowerpil' }
    };
    expect(canSyncInPlace('spotify', validation, 'curator')).toBe(false);
  });

  it('returns false when managed export has no remote_playlist_id', () => {
    const validation = {
      managedExport: { status: 'active', remote_playlist_id: null, account_type: 'flowerpil' }
    };
    expect(canSyncInPlace('spotify', validation, 'flowerpil')).toBe(false);
  });

  it('returns false when managed export status is not active', () => {
    const validation = {
      managedExport: { status: 'revoked', remote_playlist_id: 'abc', account_type: 'flowerpil' }
    };
    expect(canSyncInPlace('spotify', validation, 'flowerpil')).toBe(false);
  });

  it('returns false when no managed export exists', () => {
    expect(canSyncInPlace('spotify', {}, 'flowerpil')).toBe(false);
    expect(canSyncInPlace('spotify', { managedExport: null }, 'flowerpil')).toBe(false);
  });

  it('returns false when validation is null/undefined', () => {
    expect(canSyncInPlace('spotify', null, 'flowerpil')).toBe(false);
    expect(canSyncInPlace('spotify', undefined, 'flowerpil')).toBe(false);
  });

  it('returns false when curator owner does not match managed export owner', () => {
    const validation = {
      managedExport: {
        status: 'active',
        remote_playlist_id: 'abc',
        account_type: 'curator',
        owner_curator_id: 99
      }
    };

    expect(canSyncInPlace('spotify', validation, 'curator', 42)).toBe(false);
  });

  it('returns true when curator owner matches managed export owner', () => {
    const validation = {
      managedExport: {
        status: 'active',
        remote_playlist_id: 'abc',
        account_type: 'curator',
        owner_curator_id: 42
      }
    };

    expect(canSyncInPlace('spotify', validation, 'curator', 42)).toBe(true);
  });

  it('allows sync when managed export has no account_type (legacy backfill)', () => {
    const validation = {
      managedExport: { status: 'active', remote_playlist_id: 'abc', account_type: null }
    };
    // Legacy rows without account_type skip ownership check - allow sync
    expect(canSyncInPlace('spotify', validation, 'flowerpil')).toBe(true);
  });
});

describe('getExportActionLabel', () => {
  it('returns sync label when sync is possible', () => {
    const validation = {
      managedExport: { status: 'active', remote_playlist_id: 'abc', account_type: 'flowerpil' }
    };
    expect(getExportActionLabel('spotify', validation, 'flowerpil')).toBe('Updates existing playlist');
  });

  it('returns create-new for Apple with existing export', () => {
    const validation = {
      alreadyExported: true,
      managedExport: { status: 'active', remote_playlist_id: 'p.abc', account_type: 'flowerpil' }
    };
    expect(getExportActionLabel('apple', validation, 'flowerpil')).toBe('Creates new playlist');
  });

  it('returns create-new when account mismatch on replaceable platform', () => {
    const validation = {
      alreadyExported: true,
      managedExport: { status: 'active', remote_playlist_id: 'abc', account_type: 'flowerpil' }
    };
    expect(getExportActionLabel('spotify', validation, 'curator')).toBe('Creates new playlist');
  });

  it('returns will-create for fresh platform with no exports', () => {
    expect(getExportActionLabel('spotify', {}, 'flowerpil')).toBe('Will create new playlist on export');
  });

  it('returns will-create when only legacy alreadyExported flag without managed export', () => {
    const validation = { alreadyExported: true, managedExport: null };
    expect(getExportActionLabel('spotify', validation, 'flowerpil')).toBe('Creates new playlist');
  });
});

describe('hasSyncableSelection', () => {
  it('returns false when only an unselected platform can sync in place', () => {
    const validations = {
      spotify: {
        managedExport: {
          status: 'active',
          remote_playlist_id: 'sp-1',
          account_type: 'flowerpil'
        }
      },
      apple: {
        managedExport: {
          status: 'active',
          remote_playlist_id: 'ap-1',
          account_type: 'flowerpil'
        }
      }
    };
    const exportChoices = { spotify: false, apple: true };
    const accountTypes = { spotify: 'flowerpil', apple: 'flowerpil' };

    expect(hasSyncableSelection(['spotify', 'apple'], exportChoices, validations, accountTypes)).toBe(false);
  });

  it('returns true when a selected platform can sync in place', () => {
    const validations = {
      tidal: {
        managedExport: {
          status: 'active',
          remote_playlist_id: 'td-1',
          account_type: 'flowerpil'
        }
      }
    };
    const exportChoices = { tidal: true };
    const accountTypes = { tidal: 'flowerpil' };

    expect(hasSyncableSelection(['spotify', 'tidal', 'apple'], exportChoices, validations, accountTypes)).toBe(true);
  });
});
