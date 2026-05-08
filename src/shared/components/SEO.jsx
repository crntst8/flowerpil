import { useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * SEO Component - Manages document head meta tags for SEO
 *
 * @param {Object} props
 * @param {string} props.title - Page title (will be suffixed with " | Flowerpil")
 * @param {string} props.description - Meta description
 * @param {string} props.canonical - Canonical URL path (e.g., "/discover")
 * @param {string} props.image - OpenGraph image URL
 * @param {string} props.type - OpenGraph type (default: "website")
 * @param {Object} props.structuredData - JSON-LD structured data object
 * @param {boolean} props.noindex - Set to true to add noindex tag
 * @param {string[]} props.keywords - Array of keywords for meta keywords tag
 */
const SEO = ({
  title,
  description,
  canonical,
  image,
  type = 'website',
  structuredData,
  noindex = false,
  keywords = []
}) => {
  const siteUrl = 'https://flowerpil.io';
  const siteName = 'Flowerpil';
  const defaultImage = `${siteUrl}/og-image.png`;

  const fullTitle = title ? `${title} | ${siteName}` : siteName;
  const canonicalValue = typeof canonical === 'string' ? canonical : null;
  const fullCanonical = canonicalValue
    ? (canonicalValue.startsWith('http://') || canonicalValue.startsWith('https://')
      ? canonicalValue
      : `${siteUrl}${canonicalValue}`)
    : null;
  const ogImage = image || defaultImage;

  useEffect(() => {
    // Track created elements for cleanup
    const createdElements = [];

    const setMeta = (name, content, isProperty = false) => {
      if (!content) return;

      const attr = isProperty ? 'property' : 'name';
      let meta = document.querySelector(`meta[${attr}="${name}"]`);

      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, name);
        document.head.appendChild(meta);
        createdElements.push(meta);
      }
      meta.setAttribute('content', content);
    };

    const setLink = (rel, href) => {
      if (!href) return;

      let link = document.querySelector(`link[rel="${rel}"]`);

      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', rel);
        document.head.appendChild(link);
        createdElements.push(link);
      }
      link.setAttribute('href', href);
    };

    // Set document title
    document.title = fullTitle;

    // Basic meta tags
    setMeta('description', description);
    if (keywords.length > 0) {
      setMeta('keywords', keywords.join(', '));
    }

    // Robots
    if (noindex) {
      setMeta('robots', 'noindex, nofollow');
    } else {
      setMeta('robots', 'index, follow');
    }

    // OpenGraph tags
    setMeta('og:title', fullTitle, true);
    setMeta('og:description', description, true);
    setMeta('og:type', type, true);
    setMeta('og:site_name', siteName, true);
    setMeta('og:image', ogImage, true);
    if (fullCanonical) {
      setMeta('og:url', fullCanonical, true);
    }

    // Twitter Card tags
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', description);
    setMeta('twitter:image', ogImage);

    // Canonical URL
    if (fullCanonical) {
      setLink('canonical', fullCanonical);
    }

    // Structured Data (JSON-LD)
    let scriptElement = document.querySelector('script[data-seo-jsonld]');
    if (structuredData) {
      if (!scriptElement) {
        scriptElement = document.createElement('script');
        scriptElement.type = 'application/ld+json';
        scriptElement.setAttribute('data-seo-jsonld', 'true');
        document.head.appendChild(scriptElement);
        createdElements.push(scriptElement);
      }
      scriptElement.textContent = JSON.stringify(structuredData);
    } else if (scriptElement) {
      scriptElement.remove();
    }

    // Cleanup on unmount
    return () => {
      document.title = 'flowerpil.io';

      // Remove created elements
      createdElements.forEach(el => {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    };
  }, [fullTitle, description, fullCanonical, ogImage, type, structuredData, noindex, keywords]);

  return null;
};

SEO.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  canonical: PropTypes.string,
  image: PropTypes.string,
  type: PropTypes.string,
  structuredData: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  noindex: PropTypes.bool,
  keywords: PropTypes.arrayOf(PropTypes.string)
};

/**
 * Generates WebSite structured data
 */
export const generateWebsiteSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Flowerpil',
  url: 'https://flowerpil.io',
  description: 'Cross-platform, curated, by people. Playlists and tracks with links to every major platform.',
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://flowerpil.io/curators?search={search_term_string}',
    'query-input': 'required name=search_term_string'
  }
});

/**
 * Generates Organization structured data
 */
export const generateOrganizationSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Flowerpil',
  url: 'https://flowerpil.io',
  logo: 'https://flowerpil.io/logo.png',
  description: 'Cross-platform, curated, by people.',
  sameAs: []
});

/**
 * Generates MusicPlaylist structured data
 */
export const generatePlaylistSchema = (playlist) => ({
  '@context': 'https://schema.org',
  '@type': 'MusicPlaylist',
  name: playlist.title,
  description: playlist.description,
  url: `https://flowerpil.io/playlists/${playlist.id}`,
  creator: {
    '@type': 'Person',
    name: playlist.curatorName
  },
  numTracks: playlist.trackCount || 0
});

/**
 * Generates ItemList structured data for list pages
 */
export const generateItemListSchema = (items, listName) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: listName,
  numberOfItems: items.length,
  itemListElement: items.slice(0, 10).map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: {
      '@type': item.type || 'Thing',
      name: item.name,
      url: item.url
    }
  }))
});

export default SEO;
