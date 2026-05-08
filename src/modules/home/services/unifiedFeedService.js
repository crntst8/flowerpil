// Unified feed service for home page discovery
import { getPublicFeedPlaylists } from '@modules/playlists/services/playlistService';
import { getPublishedBlogPosts } from '@modules/blog/services/blogService';
import { fetchFeed as getFeatureFeed } from '@modules/features/services/featurePiecesService';

class UnifiedFeedServiceError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'UnifiedFeedServiceError';
    this.status = status;
    this.details = details;
  }
}

// Fetch published landing page links
const getLandingPageLinks = async () => {
  try {
    const response = await fetch('/api/v1/public/landing-page-links');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.links || [];
  } catch (error) {
    console.warn('Error fetching landing page links:', error);
    return [];
  }
};

// Fetch published releases for feed
const getPublishedReleases = async (limit = 50) => {
  try {
    const response = await fetch(`/api/v1/releases/feed?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.warn('Error fetching releases feed:', error);
    return [];
  }
};

// Get feed of playlists, blog posts, feature pieces, releases, and landing page links sorted by date
export const getUnifiedFeed = async (options = {}) => {
  try {
    const { limit = 50 } = options;

    // Fetch playlists, posts, features, releases, and landing page links in parallel
    const [playlists, blogPosts, featurePieces, releases, landingPageLinks] = await Promise.all([
      getPublicFeedPlaylists(limit).catch(error => {
        console.warn('Error fetching public feed for unified feed:', error);
        return [];
      }),
      getPublishedBlogPosts().catch(error => {
        console.warn('Error fetching blog posts for unified feed:', error);
        return [];
      }),
      getFeatureFeed().then((response) => response?.data || []).catch(error => {
        console.warn('Error fetching feature pieces for unified feed:', error);
        return [];
      }),
      getPublishedReleases(limit).catch(error => {
        console.warn('Error fetching releases for unified feed:', error);
        return [];
      }),
      getLandingPageLinks().catch(error => {
        console.warn('Error fetching landing page links for unified feed:', error);
        return [];
      })
    ]);

    // Add content type identifier to playlists
    // Preserve pinned order from the API - pinned playlists have pinned=true and come first
    const playlistsWithType = playlists.map((item, index) => ({
      ...item,
      contentType: 'playlist',
      sortDate: new Date(item.published_at || item.publish_date || item.created_at || Date.now()),
      _pinnedOrder: item.pinned ? index : null // Track pinned order (only for pinned playlists)
    }));

    // Add content type identifier to blog posts
    const blogPostsWithType = Array.isArray(blogPosts) ? blogPosts.filter(post => post.featured_on_homepage).map(item => ({
      ...item,
      contentType: 'post',
      sortDate: new Date(item.published_at || item.created_at || Date.now())
    })) : [];

    const featurePiecesWithType = Array.isArray(featurePieces) ? featurePieces.map(item => ({
      ...item,
      contentType: 'feature',
      sortDate: new Date(item.published_at || item.created_at || Date.now())
    })) : [];

    // Releases already have contentType and sortDate from API
    const releasesWithType = Array.isArray(releases) ? releases.map(item => ({
      ...item,
      contentType: 'release',
      sortDate: new Date(item.post_date || item.release_date || item.created_at || Date.now())
    })) : [];

    // Add content type identifier to landing page links
    const linksWithType = Array.isArray(landingPageLinks) ? landingPageLinks.map(item => ({
      ...item,
      contentType: 'link',
      sortDate: new Date(item.created_at || Date.now())
    })) : [];

    // Combine and sort: pinned playlists first (in their order), then everything else by date/priority
    const combinedFeed = [...playlistsWithType, ...blogPostsWithType, ...featurePiecesWithType, ...releasesWithType, ...linksWithType];
    combinedFeed.sort((a, b) => {
      // Pinned playlists always come first (they have pinned=true from the API)
      const aIsPinned = a.contentType === 'playlist' && a.pinned === true;
      const bIsPinned = b.contentType === 'playlist' && b.pinned === true;

      // Both pinned: preserve their order from the API
      if (aIsPinned && bIsPinned) {
        return a._pinnedOrder - b._pinnedOrder;
      }

      // Only one is pinned: pinned comes first
      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;

      // Links with higher priority come first (among non-pinned content)
      if (a.contentType === 'link' && b.contentType === 'link') {
        const priorityDiff = (b.priority || 0) - (a.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
      }
      // Otherwise sort by date (newest first)
      return b.sortDate - a.sortDate;
    });

    // Apply limit to combined feed
    return combinedFeed.slice(0, limit);

  } catch (error) {
    console.error('Error fetching unified feed:', error);
    throw new UnifiedFeedServiceError(
      'Failed to fetch unified feed',
      500,
      { originalError: error }
    );
  }
};

// Get count statistics for feed content
export const getFeedStats = async () => {
  try {
    const [playlists, blogPosts, featurePieces] = await Promise.all([
      getPublicFeedPlaylists().catch(() => []),
      getPublishedBlogPosts().catch(() => []),
      getFeatureFeed().then((response) => response?.data || []).catch(() => [])
    ]);

    const publishedPosts = Array.isArray(blogPosts) ? blogPosts.length : 0;
    const publishedFeatures = Array.isArray(featurePieces) ? featurePieces.length : 0;

    return {
      total: playlists.length + publishedPosts + publishedFeatures,
      playlists: playlists.length,
      posts: publishedPosts,
      features: publishedFeatures
    };

  } catch (error) {
    console.error('Error fetching feed stats:', error);
    return {
      total: 0,
      playlists: 0
    };
  }
};
