const PLATFORM_CAPABILITIES = {
  spotify: { canReplace: true, canReadTracks: true },
  tidal: { canReplace: true, canReadTracks: true },
  apple: { canReplace: false, canReadTracks: false },
  youtube_music: { canReplace: false, canReadTracks: true }
};

export const getPlatformCapabilities = (platform) => {
  return PLATFORM_CAPABILITIES[platform] || { canReplace: false, canReadTracks: false };
};

export default PLATFORM_CAPABILITIES;
