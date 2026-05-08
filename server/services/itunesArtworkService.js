import axios from 'axios';

class iTunesArtworkService {
  constructor() {
    this.baseURL = 'https://itunes.apple.com/search';
    this.timeout = 10000; // 10 seconds
  }

  // Search for artwork using artist and track name
  async searchTrackArtwork(artist, track, limit = 5) {
    try {
      const query = `${artist} ${track}`.trim();
      
      const response = await axios.get(this.baseURL, {
        params: {
          term: query,
          media: 'music',
          entity: 'song',
          attribute: 'songTerm',
          limit: limit
        },
        timeout: this.timeout
      });

      return this.processSearchResults(response.data.results, artist, track);
    } catch (error) {
      console.error('iTunes search error:', error.message);
      throw new Error('Failed to search iTunes for artwork');
    }
  }

  // Search for artwork using album name
  async searchAlbumArtwork(artist, album, limit = 5) {
    try {
      const query = `${artist} ${album}`.trim();
      
      const response = await axios.get(this.baseURL, {
        params: {
          term: query,
          media: 'music',
          entity: 'album',
          attribute: 'albumTerm',
          limit: limit
        },
        timeout: this.timeout
      });

      return this.processSearchResults(response.data.results, artist, album, true);
    } catch (error) {
      console.error('iTunes album search error:', error.message);
      throw new Error('Failed to search iTunes for album artwork');
    }
  }

  // Process and format search results
  processSearchResults(results, searchArtist, searchTitle, isAlbum = false) {
    if (!results || results.length === 0) {
      return [];
    }

    return results.map(result => {
      const artwork = this.extractArtworkUrls(result.artworkUrl100 || result.artworkUrl60 || result.artworkUrl30);
      
      return {
        id: result.trackId || result.collectionId,
        type: isAlbum ? 'album' : 'track',
        artist: result.artistName,
        title: isAlbum ? result.collectionName : result.trackName,
        album: result.collectionName,
        genre: result.primaryGenreName,
        releaseDate: result.releaseDate,
        artwork: artwork,
        relevanceScore: this.calculateRelevance(
          result.artistName, 
          isAlbum ? result.collectionName : result.trackName,
          searchArtist,
          searchTitle
        ),
        previewUrl: result.previewUrl,
        trackViewUrl: result.trackViewUrl || result.collectionViewUrl
      };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  // Extract different sizes of artwork URLs
  extractArtworkUrls(baseUrl) {
    if (!baseUrl) return null;

    // iTunes artwork URLs follow a pattern where we can change the size
    const basePart = baseUrl.replace(/\d+x\d+/, '{size}');
    
    return {
      small: basePart.replace('{size}', '100x100'),
      medium: basePart.replace('{size}', '300x300'),
      large: basePart.replace('{size}', '600x600'),
      extraLarge: basePart.replace('{size}', '1000x1000'),
      original: baseUrl
    };
  }

  // Calculate relevance score for search results
  calculateRelevance(resultArtist, resultTitle, searchArtist, searchTitle) {
    let score = 0;
    
    // Normalize strings for comparison
    const normalizeString = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    const normResultArtist = normalizeString(resultArtist || '');
    const normResultTitle = normalizeString(resultTitle || '');
    const normSearchArtist = normalizeString(searchArtist || '');
    const normSearchTitle = normalizeString(searchTitle || '');

    // Artist match scoring
    if (normResultArtist === normSearchArtist) {
      score += 50; // Exact artist match
    } else if (normResultArtist.includes(normSearchArtist) || normSearchArtist.includes(normResultArtist)) {
      score += 25; // Partial artist match
    }

    // Title match scoring
    if (normResultTitle === normSearchTitle) {
      score += 50; // Exact title match
    } else if (normResultTitle.includes(normSearchTitle) || normSearchTitle.includes(normResultTitle)) {
      score += 25; // Partial title match
    }

    // Bonus for having both artist and title
    if (normResultArtist && normResultTitle && normSearchArtist && normSearchTitle) {
      score += 10;
    }

    return score;
  }

  // Download artwork from iTunes URL
  async downloadArtwork(artworkUrl, size = 'large') {
    if (!artworkUrl) {
      throw new Error('No artwork URL provided');
    }

    try {
      // If artworkUrl is an object with different sizes, select the requested size
      let downloadUrl = artworkUrl;
      if (typeof artworkUrl === 'object' && artworkUrl[size]) {
        downloadUrl = artworkUrl[size];
      }

      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Flowerpil/1.0.0'
        }
      });

      return {
        buffer: Buffer.from(response.data),
        contentType: response.headers['content-type'] || 'image/jpeg',
        size: response.data.byteLength
      };
    } catch (error) {
      console.error('Error downloading iTunes artwork:', error.message);
      throw new Error('Failed to download artwork from iTunes');
    }
  }

  // Batch search for multiple tracks
  async batchSearchArtwork(tracks, limit = 3) {
    const results = [];
    
    for (const track of tracks) {
      try {
        // Add delay to respect rate limits
        await this.delay(200);
        
        const searchResults = await this.searchTrackArtwork(
          track.artist, 
          track.title, 
          limit
        );
        
        results.push({
          track: track,
          results: searchResults
        });
      } catch (error) {
        console.error(`Error searching artwork for "${track.artist} - ${track.title}":`, error.message);
        results.push({
          track: track,
          results: [],
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Utility delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Validate artwork URL before processing
  async validateArtworkUrl(url) {
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Flowerpil/1.0.0'
        }
      });

      const contentType = response.headers['content-type'];
      const isValidImage = contentType && contentType.startsWith('image/');
      const contentLength = parseInt(response.headers['content-length']) || 0;

      return {
        valid: isValidImage,
        contentType: contentType,
        size: contentLength
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

export default iTunesArtworkService;