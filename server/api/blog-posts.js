import express from 'express';
import { getDatabase, getQueries } from '../database/db.js';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Apply logging middleware to all blog post routes
router.use(apiLoggingMiddleware);

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for images
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Utility function to generate slug from title
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Utility function to process uploaded image
const processImage = async (buffer, filename) => {
  const uploadsDir = path.join(process.cwd(), 'storage', 'uploads', 'blog');

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const outputPath = path.join(uploadsDir, `${filename}.jpg`);

  await sharp(buffer)
    .resize(1200, 675, {
      fit: 'cover',
      position: 'center'
    })
    .jpeg({ quality: 85 })
    .toFile(outputPath);

  return `/uploads/blog/${filename}.jpg`;
};

// GET /api/v1/blog-posts - Get all blog posts (admin) or published posts (public)
router.get('/blog-posts', async (req, res) => {
  try {
    const queries = getQueries();
    const { published_only } = req.query;

    let posts;
    if (published_only === 'true') {
      posts = queries.getPublishedBlogPosts.all();
    } else {
      // Admin route - requires auth
      posts = queries.getAllBlogPosts.all();
    }

    // Attach flags to each post
    const postsWithFlags = posts.map(post => {
      const flags = queries.getBlogPostFlags.all(post.id);
      return { ...post, flags };
    });

    res.json(postsWithFlags);
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch blog posts', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// GET /api/v1/blog-posts/:id - Get single blog post by ID
router.get('/blog-posts/:id', async (req, res) => {
  try {
    const queries = getQueries();
    const { id } = req.params;

    const post = queries.getBlogPostById.get(parseInt(id, 10));

    if (!post) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    // Attach flags
    const flags = queries.getBlogPostFlags.all(parseInt(id, 10));

    // Increment view count if published
    if (post.published) {
      queries.incrementBlogPostViews.run(parseInt(id, 10));
    }

    res.json({ ...post, flags });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch blog post', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch blog post' });
  }
});

// GET /api/v1/blog-posts/slug/:slug - Get blog post by slug
router.get('/blog-posts/slug/:slug', async (req, res) => {
  try {
    const queries = getQueries();
    const { slug } = req.params;

    const post = queries.getBlogPostBySlug.get(slug);

    if (!post) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    // Attach flags
    const flags = queries.getBlogPostFlags.all(post.id);

    // Only increment view count for published posts
    if (post.published) {
      queries.incrementBlogPostViews.run(post.id);
    }

    res.json({ ...post, flags });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch blog post by slug', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch blog post' });
  }
});

// POST /api/v1/blog-posts - Create new blog post (admin only)
router.post('/blog-posts', authMiddleware, upload.single('featured_image'), async (req, res) => {
  try {
    const queries = getQueries();
    const { title, author_id, excerpt, content, published, featured_on_homepage, homepage_display_order } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Generate slug from title
    let slug = generateSlug(title);

    // Ensure slug is unique
    let slugExists = queries.getBlogPostBySlug.get(slug);
    let counter = 1;
    while (slugExists) {
      slug = `${generateSlug(title)}-${counter}`;
      slugExists = queries.getBlogPostBySlug.get(slug);
      counter++;
    }

    // Process image if uploaded
    let imagePath = null;
    if (req.file) {
      const filename = `${Date.now()}-${slug}`;
      imagePath = await processImage(req.file.buffer, filename);
    }

    // Set published_at if publishing
    const publishedAt = (published === 'true' || published === true) ? new Date().toISOString() : null;

    const result = queries.insertBlogPost.run(
      slug,
      title,
      author_id ? parseInt(author_id, 10) : null,
      excerpt || null,
      content || null,
      imagePath,
      (published === 'true' || published === true) ? 1 : 0,
      publishedAt,
      (featured_on_homepage === 'true' || featured_on_homepage === true) ? 1 : 0,
      homepage_display_order ? parseInt(homepage_display_order, 10) : 0
    );

    const newPost = queries.getBlogPostById.get(result.lastInsertRowid);

    // Auto-assign "Post" content tag
    try {
      const postsTag = getDatabase().prepare(`
        SELECT id FROM custom_playlist_flags WHERE url_slug = 'posts'
      `).get();

      if (postsTag) {
        queries.assignBlogPostFlag.run(result.lastInsertRowid, postsTag.id, req.user?.id || null);
      }
    } catch (error) {
      logger.warn('ADMIN', 'Failed to auto-assign Post tag', { error: error.message });
    }

    // Attach flags
    const flags = queries.getBlogPostFlags.all(result.lastInsertRowid);

    logger.info('ADMIN', 'Blog post created', {
      postId: result.lastInsertRowid,
      title,
      slug,
      userId: req.user?.id
    });

    res.status(201).json({ ...newPost, flags });
  } catch (error) {
    logger.error('ERROR', 'Failed to create blog post', { error: error.message });
    res.status(500).json({ error: 'Failed to create blog post' });
  }
});

// PUT /api/v1/blog-posts/:id - Update blog post (admin only)
router.put('/blog-posts/:id', authMiddleware, upload.single('featured_image'), async (req, res) => {
  try {
    const queries = getQueries();
    const { id } = req.params;
    const { title, author_id, excerpt, content, published, featured_on_homepage, homepage_display_order, slug: customSlug } = req.body;

    const existingPost = queries.getBlogPostById.get(parseInt(id, 10));
    if (!existingPost) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Use custom slug if provided, otherwise generate from title
    let slug = customSlug || generateSlug(title);

    // Ensure slug is unique (except for current post)
    let slugExists = queries.getBlogPostBySlug.get(slug);
    if (slugExists && slugExists.id !== parseInt(id, 10)) {
      let counter = 1;
      const baseSlug = slug;
      while (slugExists && slugExists.id !== parseInt(id, 10)) {
        slug = `${baseSlug}-${counter}`;
        slugExists = queries.getBlogPostBySlug.get(slug);
        counter++;
      }
    }

    // Process new image if uploaded
    let imagePath = existingPost.featured_image;
    if (req.file) {
      const filename = `${Date.now()}-${slug}`;
      imagePath = await processImage(req.file.buffer, filename);

      // Delete old image if exists
      if (existingPost.featured_image) {
        const oldImagePath = path.join(process.cwd(), 'storage', existingPost.featured_image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
    }

    // Set published_at if newly publishing
    let publishedAt = existingPost.published_at;
    const isPublished = (published === 'true' || published === true) ? 1 : 0;
    if (isPublished && !existingPost.published) {
      publishedAt = new Date().toISOString();
    }

    queries.updateBlogPost.run(
      slug,
      title,
      author_id ? parseInt(author_id, 10) : null,
      excerpt || null,
      content || null,
      imagePath,
      isPublished,
      publishedAt,
      (featured_on_homepage === 'true' || featured_on_homepage === true) ? 1 : 0,
      homepage_display_order ? parseInt(homepage_display_order, 10) : 0,
      parseInt(id, 10)
    );

    const updatedPost = queries.getBlogPostById.get(parseInt(id, 10));

    // Attach flags
    const flags = queries.getBlogPostFlags.all(parseInt(id, 10));

    logger.info('ADMIN', 'Blog post updated', {
      postId: id,
      title,
      slug,
      userId: req.user?.id
    });

    res.json({ ...updatedPost, flags });
  } catch (error) {
    logger.error('ERROR', 'Failed to update blog post', { error: error.message });
    res.status(500).json({ error: 'Failed to update blog post' });
  }
});

// DELETE /api/v1/blog-posts/:id - Delete blog post (admin only)
router.delete('/blog-posts/:id', authMiddleware, async (req, res) => {
  try {
    const queries = getQueries();
    const { id } = req.params;

    const post = queries.getBlogPostById.get(parseInt(id, 10));
    if (!post) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    // Delete image if exists
    if (post.featured_image) {
      const imagePath = path.join(process.cwd(), 'storage', post.featured_image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    queries.deleteBlogPost.run(parseInt(id, 10));

    logger.info('ADMIN', 'Blog post deleted', {
      postId: id,
      title: post.title,
      userId: req.user?.id
    });

    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    logger.error('ERROR', 'Failed to delete blog post', { error: error.message });
    res.status(500).json({ error: 'Failed to delete blog post' });
  }
});

export default router;
