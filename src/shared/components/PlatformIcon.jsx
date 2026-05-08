import React from 'react';
import styled from 'styled-components';

const IconContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => !['size', 'inline'].includes(prop)
})`
  display: ${props => props.inline ? 'inline-flex' : 'flex'};
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  
  ${props => props.size ? `
    width: ${props.size}px;
    height: ${props.size}px;
  ` : `
    width: 24px;
    height: 24px;
  `}
`;

const EmojiIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-style: normal;
  line-height: 1;
`;

// Platform icon mapping with fallback emojis
const PLATFORM_ICONS = {
  // Music Streaming
  spotify: { name: 'Spotify', emoji: '🎵' },
  apple: { name: 'Apple Music', emoji: '🍎' },
  applemusic: { name: 'Apple Music', emoji: '🍎', alias: 'apple' },
  tidal: { name: 'Tidal', emoji: '🌊' },
  bandcamp: { name: 'Bandcamp', emoji: '🎧' },
  soundcloud: { name: 'SoundCloud', emoji: '☁️' },
  youtube: { name: 'YouTube', emoji: '📺' },
  youtubemusic: { name: 'YouTube Music', emoji: '📺', alias: 'youtube' },
  youtube_music: { name: 'YouTube Music', emoji: '📺', alias: 'youtube' },
  
  // Social Media
  instagram: { name: 'Instagram', emoji: '📷' },
  twitter: { name: 'Twitter', emoji: '🐦' },
  x: { name: 'X (Twitter)', emoji: '🐦', alias: 'twitter' },
  facebook: { name: 'Facebook', emoji: '👥' },
  tiktok: { name: 'TikTok', emoji: '🎵' },
  linkedin: { name: 'LinkedIn', emoji: '💼' },
  discord: { name: 'Discord', emoji: '🎮' },
  twitch: { name: 'Twitch', emoji: '🎮' },
  
  // Other
  website: { name: 'Website', emoji: '🌐' },
  email: { name: 'Email', emoji: '📧' },
  curator: { name: 'Curator Profile', emoji: '👤' }
};

/**
 * PlatformIcon Component
 * 
 * Displays platform icons with automatic fallback to emojis.
 * Icons are loaded from /icons/[platform].png with retina support.
 * 
 * @param {string} platform - Platform identifier (e.g., 'spotify', 'apple')
 * @param {number} size - Icon size in pixels (optional, auto-sizes to container if not provided)
 * @param {string} className - Additional CSS class (optional)
 * @param {boolean} inline - Display inline (optional, default: false)
 * @param {boolean} forceEmoji - Force emoji fallback (optional, default: false)
 */
const PlatformIcon = ({ 
  platform, 
  size, 
  className, 
  inline = false, 
  forceEmoji = false,
  ...props 
}) => {
  if (!platform) {
    return (
      <IconContainer size={size} inline={inline} className={className} {...props}>
        <EmojiIcon>🔗</EmojiIcon>
      </IconContainer>
    );
  }

  const normalizedPlatform = platform.toLowerCase().trim();
  const platformConfig = PLATFORM_ICONS[normalizedPlatform];
  
  // Handle aliases
  const resolvedPlatform = platformConfig?.alias ? platformConfig.alias : normalizedPlatform;
  const finalConfig = platformConfig?.alias 
    ? PLATFORM_ICONS[platformConfig.alias] 
    : platformConfig;
  
  if (!finalConfig) {
    return (
      <IconContainer size={size} inline={inline} className={className} {...props}>
        <EmojiIcon>🔗</EmojiIcon>
      </IconContainer>
    );
  }

  // Force emoji mode or fallback
  if (forceEmoji) {
    return (
      <IconContainer size={size} inline={inline} className={className} {...props}>
        <EmojiIcon>{finalConfig.emoji}</EmojiIcon>
      </IconContainer>
    );
  }

  // Try to use PNG icon first, fallback to emoji
  const iconPath = `/icons/${resolvedPlatform}.png`;
  const altText = finalConfig.name;

  return (
    <IconContainer size={size} inline={inline} className={className} {...props}>
      <img
        src={iconPath}
        alt={altText}
        onError={(e) => {
          // Replace with emoji fallback on load error
          const emojiSpan = document.createElement('span');
          emojiSpan.textContent = finalConfig.emoji;
          emojiSpan.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-style: normal;
            line-height: 1;
          `;
          e.target.parentNode.replaceChild(emojiSpan, e.target);
        }}
      />
    </IconContainer>
  );
};

/**
 * getPlatformIcon - Legacy compatibility function
 * 
 * Returns a React component for the given platform.
 * Maintains backward compatibility with existing code.
 * 
 * @param {string} platform - Platform identifier
 * @param {number} size - Optional icon size
 * @returns {React.Component}
 */
export const getPlatformIcon = (platform, size = 24) => {
  return <PlatformIcon platform={platform} size={size} inline />;
};

/**
 * getPlatformEmoji - Get emoji for platform
 * 
 * Returns just the emoji character for a platform.
 * Useful for non-React contexts or special cases.
 * 
 * @param {string} platform - Platform identifier
 * @returns {string} - Emoji character
 */
export const getPlatformEmoji = (platform) => {
  const normalizedPlatform = platform?.toLowerCase().trim();
  const platformConfig = PLATFORM_ICONS[normalizedPlatform];
  
  if (platformConfig?.alias) {
    return PLATFORM_ICONS[platformConfig.alias]?.emoji || '🔗';
  }
  
  return platformConfig?.emoji || '🔗';
};

/**
 * isPlatformSupported - Check if platform is supported
 * 
 * @param {string} platform - Platform identifier
 * @returns {boolean}
 */
export const isPlatformSupported = (platform) => {
  const normalizedPlatform = platform?.toLowerCase().trim();
  return Boolean(PLATFORM_ICONS[normalizedPlatform]);
};

/**
 * getSupportedPlatforms - Get list of all supported platforms
 * 
 * @returns {Array} - Array of platform objects
 */
export const getSupportedPlatforms = () => {
  return Object.entries(PLATFORM_ICONS).map(([key, config]) => ({
    key,
    name: config.name,
    emoji: config.emoji,
    alias: config.alias
  }));
};

export default PlatformIcon;
