/**
 * Shared export helpers for UI sync/create wording.
 *
 * These mirror the backend shouldSync logic in playlistExportRunner.js
 * so the UI labels match what the backend will actually do.
 */

// Must stay in sync with server/services/platformCapabilities.js
const PLATFORM_CAPABILITIES = {
  spotify: { canReplace: true },
  tidal: { canReplace: true },
  apple: { canReplace: false },
  youtube_music: { canReplace: false }
};

/**
 * Whether the backend will sync in-place (replace existing remote playlist)
 * for this platform + validation + selected account type combination.
 *
 * Returns true only when ALL of:
 *  - platform supports canReplace (Spotify, TIDAL)
 *  - an active managed export with a remote_playlist_id exists
 *  - the selected account type matches the managed export owner
 *
 * If ownership info is not available for curator-managed exports, we fall
 * back to false (under-promise) rather than guessing.
 */
export const canSyncInPlace = (platform, validation, selectedAccountType, currentCuratorId = null) => {
  const caps = PLATFORM_CAPABILITIES[platform];
  if (!caps?.canReplace) return false;

  const me = validation?.managedExport;
  if (!me || me.status !== 'active' || !me.remote_playlist_id) return false;

  // If the managed export carries ownership info, verify it matches
  if (me.account_type && me.account_type !== selectedAccountType) return false;
  if (me.account_type === 'curator') {
    if (me.owner_curator_id == null || currentCuratorId == null) return false;
    if (String(me.owner_curator_id) !== String(currentCuratorId)) return false;
  }

  return true;
};

/**
 * Per-platform label describing what the export will do.
 */
export const getExportActionLabel = (platform, validation, selectedAccountType, currentCuratorId = null) => {
  if (canSyncInPlace(platform, validation, selectedAccountType, currentCuratorId)) {
    return 'Updates existing playlist';
  }
  // Has an existing export but can't sync - will create new
  if (validation?.alreadyExported || validation?.managedExport?.status === 'active') {
    return 'Creates new playlist';
  }
  return 'Will create new playlist on export';
};

/**
 * Whether any currently selected platform will sync in place.
 */
export const hasSyncableSelection = (
  platforms,
  exportChoices,
  validations,
  accountTypes,
  currentCuratorId = null,
  defaultAccountType = 'flowerpil'
) => {
  return platforms.some((platform) => {
    if (!exportChoices?.[platform]) return false;
    const validation = validations?.[platform];
    const selectedAccountType = accountTypes?.[platform] || defaultAccountType;
    return canSyncInPlace(platform, validation, selectedAccountType, currentCuratorId);
  });
};
