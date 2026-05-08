// API service functions for blog posts
import { cachedFetch } from '@shared/services/cacheService';

const API_BASE = '/api/v1';

class BlogServiceError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'BlogServiceError';
    this.status = status;
    this.details = details;
  }
}

const handleResponse = async (response) => {
  const data = await response.json();

  if (!response.ok) {
    throw new BlogServiceError(
      data.error || 'Request failed',
      response.status,
      data
    );
  }

  return data;
};

// Public blog post operations - only published posts
export const getPublishedBlogPosts = async () => {
  try {
    const params = new URLSearchParams({ published_only: 'true' });
    const url = `${API_BASE}/blog-posts?${params.toString()}`;
    const response = await cachedFetch(url);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching published blog posts:', error);
    throw error;
  }
};

export const getBlogPostBySlug = async (slug) => {
  try {
    const response = await cachedFetch(`${API_BASE}/blog-posts/slug/${slug}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    throw error;
  }
};

// Admin operations (requires authentication)
export const getAllBlogPosts = async () => {
  try {
    const response = await fetch(`${API_BASE}/blog-posts`, {
      credentials: 'include'
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching all blog posts:', error);
    throw error;
  }
};

export const createBlogPost = async (formData) => {
  try {
    const response = await fetch(`${API_BASE}/blog-posts`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error creating blog post:', error);
    throw error;
  }
};

export const updateBlogPost = async (id, formData) => {
  try {
    const response = await fetch(`${API_BASE}/blog-posts/${id}`, {
      method: 'PUT',
      credentials: 'include',
      body: formData
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error updating blog post:', error);
    throw error;
  }
};

export const deleteBlogPost = async (id) => {
  try {
    const response = await fetch(`${API_BASE}/blog-posts/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error deleting blog post:', error);
    throw error;
  }
};

// Utility functions for display
const R2_PUBLIC_URL = 'https://images.flowerpil.io';

export const getImageUrl = (imagePath, size = 'original') => {
  if (!imagePath) return null;

  const applySizeSuffix = (path) => {
    const lastDotIndex = path.lastIndexOf('.');
    if (lastDotIndex === -1) return path;

    const extension = path.substring(lastDotIndex);
    let baseWithoutExt = path.substring(0, lastDotIndex);

    // Remove any existing size suffixes
    baseWithoutExt = baseWithoutExt.replace(/_(large|medium|small|original|lg|md|sm)$/, '');

    if (size === 'original') {
      return `${baseWithoutExt}${extension}`;
    }

    return `${baseWithoutExt}_${size}${extension}`;
  };

  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    if (size === 'original') return imagePath;

    try {
      const url = new URL(imagePath);
      const sizedPath = applySizeSuffix(url.pathname);
      return `${url.origin}${sizedPath}${url.search}`;
    } catch (error) {
      console.warn('Failed to parse blog image URL:', imagePath, error);
      return imagePath;
    }
  }

  let basePath = imagePath;
  if (!imagePath.startsWith('/')) {
    basePath = `/uploads/${imagePath}`;
  }

  const sizedPath = applySizeSuffix(basePath);

  // Convert /uploads/ paths to R2 URLs
  if (basePath.startsWith('/uploads/')) {
    const r2Key = sizedPath.replace(/^\/uploads\//, '');
    return `${R2_PUBLIC_URL}/${r2Key}`;
  }

  return sizedPath;
};

export const formatPostDate = (dateString) => {
  if (!dateString) return '';

  try {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    return `${day} ${month}`;
  } catch (error) {
    return dateString;
  }
};

export const formatFullDate = (dateString) => {
  if (!dateString) return '';

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
};
