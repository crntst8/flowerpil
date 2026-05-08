// TypeScript-like JSDoc types for Curator Profile System
// This provides type safety in JavaScript using JSDoc annotations

/**
 * @typedef {'Album'|'EP'|'Live Recording'|'Remix'|'Single'} ReleaseType
 */

/**
 * @typedef {'SingleDSP'|'AudioUpload'|'MusicVideo'} FeaturedContentKind
 */

/**
 * @typedef {'ON_SALE'|'FIFTY_SOLD'|'SOLD_OUT'} SaleIndicator
 */

/**
 * Section configuration for collapsible curator profile sections
 * @typedef {Object} SectionConfig
 * @property {boolean} enabled - Whether the section is enabled
 * @property {number} displayOrder - Order in which sections appear
 * @property {boolean} openOnLoad - Whether section should be expanded by default
 */

/**
 * Featured content for releases - discriminated union type
 * @typedef {Object} FeaturedContentBase
 * @property {FeaturedContentKind} kind - Type of featured content
 * @property {string} url - URL to the content
 */

/**
 * @typedef {FeaturedContentBase & {kind: 'SingleDSP'}} SingleDSPContent
 */

/**
 * @typedef {FeaturedContentBase & {kind: 'AudioUpload', durationSec: number}} AudioUploadContent
 */

/**
 * @typedef {FeaturedContentBase & {kind: 'MusicVideo'}} MusicVideoContent
 */

/**
 * @typedef {SingleDSPContent|AudioUploadContent|MusicVideoContent} FeaturedContent
 */

/**
 * Upcoming release item
 * @typedef {Object} ReleaseItem
 * @property {number} id - Unique identifier
 * @property {number} curatorId - Associated curator ID
 * @property {number} sortOrder - Display order within releases
 * @property {string} title - Release title (uppercase)
 * @property {string|null} artworkUrl - Relative path to artwork image
 * @property {string} releaseDate - Release date (YYYY-MM-DD)
 * @property {ReleaseType|null} releaseType - Type of release
 * @property {string|null} preOrderUrl - Pre-order link URL
 * @property {string|null} preSaveUrl - Pre-save link URL
 * @property {string|null} infoUrl - More info link URL
 * @property {FeaturedContentKind|null} featuredKind - Type of featured content
 * @property {string|null} featuredUrl - Featured content URL
 * @property {number|null} featuredDurationSec - Duration for audio content
 * @property {string} createdAt - Creation timestamp
 * @property {string} updatedAt - Last update timestamp
 */

/**
 * Guest/supporting act for a show
 * @typedef {Object} ShowGuest
 * @property {number} id - Unique identifier
 * @property {number} showId - Associated show ID
 * @property {number} sortOrder - Display order within guests
 * @property {string} name - Guest/supporting act name
 */

/**
 * Upcoming show item
 * @typedef {Object} ShowItem
 * @property {number} id - Unique identifier
 * @property {number} curatorId - Associated curator ID
 * @property {number} sortOrder - Display order within shows
 * @property {string} showDate - Show date (YYYY-MM-DD)
 * @property {string} city - City name
 * @property {string} country - Country name
 * @property {string} venue - Venue name
 * @property {string|null} ticketUrl - Ticket purchase URL
 * @property {string|null} infoUrl - More info URL
 * @property {SaleIndicator|null} saleIndicator - Ticket sale status
 * @property {ShowGuest[]} guests - Supporting acts/guests
 * @property {string} createdAt - Creation timestamp
 * @property {string} updatedAt - Last update timestamp
 */

/**
 * Extended curator profile with upcoming releases and shows
 * @typedef {Object} CuratorProfile
 * @property {number} id - Unique identifier
 * @property {string} name - Curator name
 * @property {string} type - Legacy type field
 * @property {string} profileType - Profile type (curator, label, label-ar, artist-manager, etc.)
 * @property {string|null} bio - Full biography
 * @property {string|null} bioShort - Short description
 * @property {string|null} profileImage - Profile image URL (relative path)
 * @property {string|null} coverImage - Cover image URL (relative path)
 * @property {string|null} location - Geographic location
 * @property {string|null} websiteUrl - Primary website URL
 * @property {string|null} contactEmail - Contact email
 * @property {Array<{platform: string, url: string}>} socialLinks - Social media links
 * @property {Array<{title: string, url: string}>} externalLinks - Other external links
 * @property {string} verificationStatus - Verification status
 * @property {string} profileVisibility - Visibility setting
 * @property {Object|null} customFields - Extensible metadata
 * @property {SectionConfig} upcomingReleasesConfig - Releases section config
 * @property {SectionConfig} upcomingShowsConfig - Shows section config
 * @property {ReleaseItem[]} upcomingReleases - List of upcoming releases
 * @property {ShowItem[]} upcomingShows - List of upcoming shows
 * @property {string} createdAt - Creation timestamp
 * @property {string} updatedAt - Last update timestamp
 */

/**
 * API request types for creating/updating releases
 * @typedef {Object} ReleaseFormData
 * @property {string} title - Release title
 * @property {string} releaseDate - Release date (YYYY-MM-DD)
 * @property {ReleaseType|null} releaseType - Type of release
 * @property {string|null} preOrderUrl - Pre-order URL
 * @property {string|null} preSaveUrl - Pre-save URL
 * @property {string|null} infoUrl - Info URL
 * @property {FeaturedContentKind|null} featuredKind - Featured content type
 * @property {string|null} featuredUrl - Featured content URL
 * @property {number|null} featuredDurationSec - Audio duration in seconds
 */

/**
 * API request types for creating/updating shows
 * @typedef {Object} ShowFormData
 * @property {string} showDate - Show date (YYYY-MM-DD)
 * @property {string} city - City name
 * @property {string} country - Country name
 * @property {string} venue - Venue name
 * @property {string|null} ticketUrl - Ticket URL
 * @property {string|null} infoUrl - Info URL
 * @property {SaleIndicator|null} saleIndicator - Sale status
 * @property {string[]} guests - Array of guest/supporting act names
 */

/**
 * Curator section configuration update
 * @typedef {Object} SectionConfigUpdate
 * @property {'upcoming_releases'|'upcoming_shows'} section - Section to configure
 * @property {boolean} enabled - Whether section is enabled
 * @property {number} displayOrder - Display order
 * @property {boolean} openOnLoad - Default open state
 */

// Export types for use in components
export {};

// JSDoc type definitions for validation schemas
/**
 * @typedef {Object} ValidationError
 * @property {string} field - Field name with error
 * @property {string} message - Error message
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether validation passed
 * @property {ValidationError[]} errors - Array of validation errors
 */