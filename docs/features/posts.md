# Blog Posts Feature

## Purpose

The blog posts feature provides site administrators with the ability to create, manage, and publish blog articles that appear in the unified content feed on the landing page alongside playlists. Posts support rich text content, optional featured images, and automatic "Post" content-tag assignment for categorization and discovery.

## How It Works

### Architecture

The feature follows a modular architecture with separation between frontend components, API layer, and database operations.

**Frontend Module**: `/src/modules/blog/`
- `components/BlogPostCard.jsx` - Card component for landing page display
- `components/BlogPostDetail.jsx` - Full post view page
- `services/blogService.js` - API client and utility functions
- `index.js` - Module definition with routes and components
- `manifest.js` - Module metadata for auto-registration

**Backend API**: `/server/api/blog-posts.js`
- RESTful endpoints for CRUD operations
- Automatic "Post" content-tag assignment on creation
- Image upload handling via multer
- View count tracking

**Content-Tag Integration**: `/server/api/public.js`
- Public content-tag page endpoint (`GET /api/v1/content-tag/:slug`)
- Returns both playlists and blog posts with the tag
- Powers `/content-tag/posts` collection page

**Database**: `/server/database/`
- `migrations/044_blog_posts_table.js` - Initial schema
- `migrations/045_blog_post_flags.js` - Content-tag integration
- `db.js` - Prepared statements and table initialization

### Data Flow

1. Admin creates post in BlogTab (`/src/modules/admin/components/tabs/BlogTab.jsx`)
2. Form data with image sent to `POST /api/v1/blog-posts`
3. Post created in database with auto-assigned "Post" content-tag (#78862C bg, black text)
4. Published posts fetched by `getPublishedBlogPosts()` service function
5. Unified feed service merges posts with playlists by date
6. LandingPage renders BlogPostCard for each post with content-tag at top
7. User clicks card to navigate to `/posts/{slug}` route
8. User can click "Post" tag to view all posts at `/content-tag/posts`
9. BlogPostDetail component loads post data via slug

### Key Components

**BlogPostCard** (`/src/modules/blog/components/BlogPostCard.jsx`)

Renders a post card on the landing page with conditional image display, date, title, excerpt, and content-tag flags.

```javascript
const BlogPostCard = ({ post }) => {
  const hasImage = post.featured_image && post.featured_image.trim() !== '';
  const primaryImage = hasImage ? getImageUrl(post.featured_image) : null;
  const postDate = formatPostDate(post.published_at || post.created_at);
  const plainTextExcerpt = stripHtml(post.excerpt);

  return (
    <CardLink to={`/posts/${post.slug}`}>
      <Card $hasImage={hasImage}>
        {hasImage && primaryImage && <ImageSection>...</ImageSection>}
        <ContentSection $hasImage={hasImage}>...</ContentSection>
        {post.flags && <FlagsContainer>...</FlagsContainer>}
      </Card>
    </CardLink>
  );
};
```

**BlogPostDetail** (`/src/modules/blog/components/BlogPostDetail.jsx`)

Displays full post content with featured image, metadata, rich HTML rendering, and view count tracking.

```javascript
const BlogPostDetail = () => {
  const { slug } = useParams();
  const [post, setPost] = useState(null);

  useEffect(() => {
    const fetchPost = async () => {
      const data = await getBlogPostBySlug(slug);
      setPost(data);
    };
    fetchPost();
  }, [slug]);

  return (
    <PageContainer>
      <ReusableHeader />
      <ContentContainer>
        <Article>
          {hasImage && featuredImage && <FeaturedImage>...</FeaturedImage>}
          <ArticleHeader>...</ArticleHeader>
          <ArticleContent>
            <ContentBody dangerouslySetInnerHTML={{ __html: post.content }} />
          </ArticleContent>
        </Article>
      </ContentContainer>
    </PageContainer>
  );
};
```

**BlogTab** (`/src/modules/admin/components/tabs/BlogTab.jsx`)

Admin interface for managing posts with RichTextEditor integration for excerpt and content fields.

```javascript
<FormField>
  <Label>Excerpt</Label>
  <RichTextEditor
    value={formData.excerpt}
    onChange={(value) => setFormData({ ...formData, excerpt: value })}
    placeholder="Short description for the card..."
  />
</FormField>

<FormField>
  <Label>Content</Label>
  <RichTextEditor
    value={formData.content}
    onChange={(value) => setFormData({ ...formData, content: value })}
    placeholder="Main blog post content..."
  />
</FormField>
```

### Utility Functions

**stripHtml** (BlogPostCard.jsx)

Converts rich HTML to plain text for excerpt display on cards.

```javascript
const stripHtml = (html) => {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};
```

**getImageUrl** (`/src/modules/blog/services/blogService.js`)

Converts image paths to R2 CDN URLs.

```javascript
export const getImageUrl = (imagePath, size = 'original') => {
  if (!imagePath) return null;

  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  let basePath = imagePath;
  if (!imagePath.startsWith('/')) {
    basePath = `/uploads/${imagePath}`;
  }

  if (basePath.startsWith('/uploads/')) {
    const r2Key = basePath.replace(/^\/uploads\//, '');
    return `${R2_PUBLIC_URL}/${r2Key}`;
  }

  return basePath;
};
```

**formatPostDate** (`/src/modules/blog/services/blogService.js`)

Formats date in "DD MONTH" format for card display.

```javascript
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
```

## API/Interface

### REST Endpoints

**GET /api/v1/blog-posts**

Returns all blog posts (admin) or published posts only (public).

Query Parameters:
- `published_only` (string, optional) - Set to "true" to return only published posts

Response:
```json
[
  {
    "id": 1,
    "slug": "my-first-post",
    "title": "My First Post",
    "author_id": 1,
    "author_name": "John Doe",
    "excerpt": "<p>Short description</p>",
    "content": "<p>Full content...</p>",
    "featured_image": "blog/2025/image.jpg",
    "published": 1,
    "published_at": "2025-11-05T10:00:00.000Z",
    "created_at": "2025-11-05T09:00:00.000Z",
    "updated_at": "2025-11-05T09:00:00.000Z",
    "featured_on_homepage": 1,
    "homepage_display_order": 0,
    "view_count": 42,
    "flags": [
      {
        "id": 15,
        "text": "Post",
        "color": "#78862C",
        "text_color": "#000000",
        "url_slug": "posts"
      }
    ]
  }
]
```

**GET /api/v1/blog-posts/:id**

Returns single blog post by ID with flags attached. Increments view count if post is published.

Response: Same structure as array item above.

**GET /api/v1/blog-posts/slug/:slug**

Returns single blog post by URL slug. Increments view count if post is published.

Response: Same structure as GET by ID.

**POST /api/v1/blog-posts**

Creates new blog post. Requires admin authentication. Auto-assigns "Posts" content tag.

Request: multipart/form-data
- `title` (string, required)
- `slug` (string, required, unique)
- `excerpt` (string, optional) - Rich HTML
- `content` (string, optional) - Rich HTML
- `published` (boolean, optional)
- `featured_on_homepage` (boolean, optional)
- `homepage_display_order` (integer, optional)
- `featured_image` (file, optional)

Response: Created post object with flags.

**PUT /api/v1/blog-posts/:id**

Updates existing blog post. Requires admin authentication.

Request: Same as POST.

Response: Updated post object with flags.

**DELETE /api/v1/blog-posts/:id**

Deletes blog post and associated image file. Requires admin authentication.

Response:
```json
{ "message": "Blog post deleted successfully" }
```

### Service Functions

**getPublishedBlogPosts()**

Fetches all published blog posts with cached fetch.

```javascript
import { getPublishedBlogPosts } from '@modules/blog/services/blogService';

const posts = await getPublishedBlogPosts();
```

**getBlogPostBySlug(slug)**

Fetches single post by URL slug.

```javascript
import { getBlogPostBySlug } from '@modules/blog/services/blogService';

const post = await getBlogPostBySlug('my-post-slug');
```

**getAllBlogPosts()**

Fetches all posts (published and unpublished). Requires admin authentication.

```javascript
import { getAllBlogPosts } from '@modules/blog/services/blogService';

const posts = await getAllBlogPosts();
```

**createBlogPost(formData)**

Creates new post. Requires FormData object with multipart data.

```javascript
import { createBlogPost } from '@modules/blog/services/blogService';

const formData = new FormData();
formData.append('title', 'My Post');
formData.append('slug', 'my-post');
formData.append('excerpt', '<p>Excerpt HTML</p>');
formData.append('content', '<p>Content HTML</p>');
formData.append('published', true);
formData.append('featured_image', fileObject);

const newPost = await createBlogPost(formData);
```

**updateBlogPost(id, formData)**

Updates existing post.

```javascript
import { updateBlogPost } from '@modules/blog/services/blogService';

const updated = await updateBlogPost(postId, formData);
```

**deleteBlogPost(id)**

Deletes post by ID.

```javascript
import { deleteBlogPost } from '@modules/blog/services/blogService';

await deleteBlogPost(postId);
```

### Component Props

**BlogPostCard**

Props:
- `post` (object, required) - Post object with all fields including flags array

**BlogPostDetail**

Uses `useParams()` to extract slug from route. No props required.

## Database

### Schema

**blog_posts table** (Migration 044)

```sql
CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  author_id INTEGER,
  excerpt TEXT,
  content TEXT,
  featured_image TEXT,
  published INTEGER DEFAULT 0,
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  featured_on_homepage INTEGER DEFAULT 1,
  homepage_display_order INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  FOREIGN KEY (author_id) REFERENCES curators(id) ON DELETE SET NULL
);
```

Indexes:
- `idx_blog_posts_published_date` - (published, published_at DESC)
- `idx_blog_posts_slug` - (slug)
- `idx_blog_posts_featured` - (featured_on_homepage, homepage_display_order)
- `idx_blog_posts_author` - (author_id)

**blog_post_flag_assignments table** (Migration 045)

Junction table linking posts to content-tags (custom_playlist_flags).

```sql
CREATE TABLE IF NOT EXISTS blog_post_flag_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  flag_id INTEGER NOT NULL,
  assigned_by INTEGER,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (post_id, flag_id),
  FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (flag_id) REFERENCES custom_playlist_flags(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES admin_users(id)
);
```

Indexes:
- `idx_blog_post_flag_assignments_post` - (post_id)
- `idx_blog_post_flag_assignments_flag` - (flag_id)

### Prepared Queries

All queries defined in `/server/database/db.js`:

**getAllBlogPosts**
```sql
SELECT bp.*, c.name as author_name
FROM blog_posts bp
LEFT JOIN curators c ON bp.author_id = c.id
ORDER BY bp.created_at DESC
```

**getBlogPostById**
```sql
SELECT bp.*, c.name as author_name
FROM blog_posts bp
LEFT JOIN curators c ON bp.author_id = c.id
WHERE bp.id = ?
```

**getBlogPostBySlug**
```sql
SELECT bp.*, c.name as author_name
FROM blog_posts bp
LEFT JOIN curators c ON bp.author_id = c.id
WHERE bp.slug = ?
```

**getPublishedBlogPosts**
```sql
SELECT bp.*, c.name as author_name
FROM blog_posts bp
LEFT JOIN curators c ON bp.author_id = c.id
WHERE bp.published = 1
ORDER BY bp.published_at DESC
```

**insertBlogPost**
```sql
INSERT INTO blog_posts (
  slug, title, author_id, excerpt, content, featured_image,
  published, published_at, featured_on_homepage, homepage_display_order
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

**updateBlogPost**
```sql
UPDATE blog_posts
SET slug = ?, title = ?, author_id = ?, excerpt = ?, content = ?,
    featured_image = ?, published = ?, published_at = ?,
    featured_on_homepage = ?, homepage_display_order = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE id = ?
```

**deleteBlogPost**
```sql
DELETE FROM blog_posts WHERE id = ?
```

**incrementBlogPostViews**
```sql
UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ?
```

**getBlogPostFlags**
```sql
SELECT cpf.id, cpf.text, cpf.color, cpf.text_color, cpf.url_slug
FROM blog_post_flag_assignments bpfa
JOIN custom_playlist_flags cpf ON bpfa.flag_id = cpf.id
WHERE bpfa.post_id = ?
ORDER BY cpf.text ASC
```

**assignBlogPostFlag**
```sql
INSERT OR IGNORE INTO blog_post_flag_assignments (post_id, flag_id, assigned_by)
VALUES (?, ?, ?)
```

**removeBlogPostFlag**
```sql
DELETE FROM blog_post_flag_assignments
WHERE post_id = ? AND flag_id = ?
```

### Auto-Assignment Logic

**Setup Script** (`/scripts/setup-post-content-tag.js`)

Run the dedicated setup script to create/update the "Post" tag and assign it to all posts:

```bash
npm run db:setup-post-tag
```

This creates the tag with correct styling (#78862C background, black text) and assigns it to all blog posts.

**Migration 045** creates "Post" content tag and assigns it to all blog posts:

```javascript
// Create "Post" content tag
const result = db.prepare(`
  INSERT INTO custom_playlist_flags (text, color, text_color, url_slug, description, allow_self_assign)
  VALUES ('Post', '#78862C', '#000000', 'posts', 'Blog posts and articles', 0)
`).run();

// Auto-assign to all existing posts
const blogPosts = db.prepare('SELECT id FROM blog_posts').all();
const insertAssignment = db.prepare(`
  INSERT OR IGNORE INTO blog_post_flag_assignments (post_id, flag_id)
  VALUES (?, ?)
`);
for (const post of blogPosts) {
  insertAssignment.run(post.id, postsTagId);
}
```

**Migration 046** updates existing tags in production databases to the new styling.

**API auto-assigns on creation:**

```javascript
// In POST /api/v1/blog-posts
const postsTag = getDatabase().prepare(`
  SELECT id FROM custom_playlist_flags WHERE url_slug = 'posts'
`).get();

if (postsTag) {
  queries.assignBlogPostFlag.run(result.lastInsertRowid, postsTag.id, req.user?.id || null);
}
```

See `/docs/setup-post-content-tag.md` for detailed setup instructions.

## Integration Points

### Unified Feed Service

Posts integrate into `/src/modules/home/services/unifiedFeedService.js` to appear alongside playlists on landing page.

```javascript
import { getPublishedBlogPosts } from '@modules/blog/services/blogService';

const [playlists, blogPosts] = await Promise.all([
  getPublicFeedPlaylists(limit),
  getPublishedBlogPosts()
]);

const blogPostsWithType = blogPosts
  .filter(post => post.featured_on_homepage)
  .map(item => ({
    ...item,
    contentType: 'post',
    sortDate: new Date(item.published_at || item.created_at || Date.now())
  }));

const combinedFeed = [...playlistsWithType, ...blogPostsWithType];
combinedFeed.sort((a, b) => b.sortDate - a.sortDate);
```

### Landing Page

`/src/modules/home/components/LandingPage.jsx` conditionally renders BlogPostCard or FeedPlaylistCard:

```javascript
import BlogPostCard from '@modules/blog/components/BlogPostCard';

{unifiedFeed.map((item, index) => (
  <FeedItem key={`${item.contentType}-${item.id}`} $index={index}>
    {item.contentType === 'post' ? (
      <BlogPostCard post={item} />
    ) : (
      <FeedPlaylistCard playlist={item} genreLookup={genreLookup} />
    )}
  </FeedItem>
))}
```

### Admin Interface

BlogTab registered in `/src/modules/admin/components/AdminPage.jsx`:

```javascript
const TAB_CONFIG = [
  { id: 'admin', label: 'Admin', component: AdminOverviewTab },
  { id: 'curators', label: 'Curators', component: CuratorsTab },
  { id: 'playlists', label: 'Playlists', component: PlaylistsTab },
  { id: 'blog', label: 'Blog', component: BlogTab },
  { id: 'exports', label: 'Exports', component: ExportsTab },
  { id: 'site-actions', label: 'Site Actions', component: SiteActionsTab }
];
```

### Content-Tag System

Posts reuse the `custom_playlist_flags` table for categorization. The "Post" tag appears at the top of each BlogPostCard with styling identical to playlist tags.

**Tag Styling** (matches FeedPlaylistCard exactly):
- **Position**: Top of card (not bottom)
- **Font**: Primary font, 14.5px (8px mobile)
- **Colors**: #78862C background, #000000 text
- **Borders**: 3-sided (left, right, bottom), no top border
- **Effects**: Gradient overlay, deep box shadows, hover expansion
- **Interaction**: Clickable, navigates to `/content-tag/posts`

**Flag Rendering in BlogPostCard:**

```javascript
{Array.isArray(post?.flags) && post.flags.length > 0 && (
  <FlagsContainer>
    {post.flags.map((flag) => {
      const slug = flag.url_slug;
      return (
        <FlagButton
          key={`${flag.id}-${slug || 'tag'}`}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (slug) {
              navigate(`/content-tag/${slug}`);
            }
          }}
          $bgColor={flag.color}
          $textColor={flag.text_color}
          disabled={!slug}
        >
          {flag.text}
        </FlagButton>
      );
    })}
  </FlagsContainer>
)}
```

**Content-Tag Collection Page** (`/content-tag/posts`)

The ContentTagPage component displays all content with a specific tag, including both blog posts and playlists:

```javascript
// Backend: GET /api/v1/content-tag/:slug returns both posts and playlists
{
  "tag": {
    "id": 15,
    "text": "Post",
    "color": "#78862C",
    "text_color": "#000000",
    "url_slug": "posts",
    "playlist_count": 0,
    "post_count": 5
  },
  "posts": [...],      // Array of blog posts with this tag
  "playlists": [...]   // Array of playlists with this tag
}
```

The page displays posts in a list format above playlists in a grid format.

### Rich Text Editor

Uses RichTextEditor from curator module (`/src/modules/curator/components/RichTextEditor.jsx`) powered by ReactQuill:

```javascript
import RichTextEditor from '@modules/curator/components/RichTextEditor';

<RichTextEditor
  value={formData.excerpt}
  onChange={(value) => setFormData({ ...formData, excerpt: value })}
  placeholder="Short description for the card..."
/>
```

### Image Upload

Uses multer middleware and Sharp for image processing:

```javascript
// In /server/api/blog-posts.js
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'));
    }
  }
});

router.post('/blog-posts', requireAuth, requireAdmin, upload.single('featured_image'), async (req, res) => {
  if (req.file) {
    const resizedBuffer = await sharp(req.file.buffer)
      .resize(1200, 675, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 85 })
      .toBuffer();

    const filename = `blog/${Date.now()}-${sanitizeFilename(req.file.originalname)}`;
    fs.writeFileSync(path.join(uploadsDir, filename), resizedBuffer);
    featured_image = filename;
  }
});
```

### Module Registration

Blog module auto-registered via `/src/modules/blog/index.js`:

```javascript
export default createModule({
  id: 'blog',
  name: 'Blog Module',
  version: '1.0.0',
  dependencies: ['common'],
  routes: [
    { path: '/posts/:slug', component: 'BlogPostDetail' }
  ],
  events: {
    emits: ['post:viewed', 'post:loaded'],
    listens: []
  },
  features: {
    'display.posts': true,
    'display.post': true,
    'navigation.public': true,
  },
  components: {
    BlogPostDetail,
    BlogPostCard,
  },
  services: blogService,
  initialize: async (context) => {
    console.log('✅ Blog module initialised');
  },
});
```

### Routing

Routes handled by DynamicRouter (`/src/core/router/DynamicRouter.jsx`):

```javascript
// DynamicRouter loads module routes
for (const [moduleId, config] of moduleLoader.moduleConfigs) {
  if (config.routes) {
    config.routes.forEach(route => {
      const LazyComponent = lazy(() =>
        moduleLoader.load(moduleId).then(module => {
          const Component = module.components?.[route.component];
          return { default: Component };
        })
      );
      // Register route: /posts/:slug -> BlogPostDetail
    });
  }
}
```

Root routing in `/src/App.jsx`:

```javascript
<Routes>
  <Route path="/" element={<Navigate to="/home" replace />} />
  <Route path="/s/:slug" element={<PublicSongPage />} />
  {/* ... other static routes ... */}
  <Route path="/*" element={<DynamicRouter />} /> {/* Catches /posts/:slug */}
</Routes>
```

## Configuration

### Environment Variables

No specific environment variables required. Uses existing configuration:

- `R2_PUBLIC_URL` - Set in blogService.js as `https://images.flowerpil.io`
- Upload directory uses server's configured uploads path (`/uploads/`)

### CDN Configuration

Images stored with prefix `blog/{timestamp}-{filename}` and served via R2 CDN:

```javascript
const R2_PUBLIC_URL = 'https://images.flowerpil.io';

export const getImageUrl = (imagePath, size = 'original') => {
  if (basePath.startsWith('/uploads/')) {
    const r2Key = basePath.replace(/^\/uploads\//, '');
    return `${R2_PUBLIC_URL}/${r2Key}`;
  }
  return basePath;
};
```

### Database Migrations

Run migrations to set up tables:

```bash
# Migrations run automatically on server start via initializeDatabase()
# Manual execution:
npm run db:migrate

# Setup the Post content-tag (recommended after migration):
npm run db:setup-post-tag
```

**Migrations:**
- **044**: Creates `blog_posts` table
- **045**: Creates `blog_post_flag_assignments` table and "Post" content tag
- **046**: Updates existing "Posts" tags to new styling (#78862C, black text)

**Setup Script:**
- Run `npm run db:setup-post-tag` to ensure the "Post" tag is properly configured
- Creates/updates tag with correct colors
- Assigns tag to all existing blog posts
- Safe to run multiple times

See `/docs/setup-post-content-tag.md` for troubleshooting and detailed instructions.

### Admin Setup

1. Admin user must be authenticated to access Blog tab
2. Navigate to `/admin` route
3. Click "Blog" tab in admin interface
4. Create posts with title, slug, rich text excerpt/content, and optional image
5. Toggle "Published" to make post visible on landing page
6. Toggle "Featured on Homepage" to include in unified feed

### Module Dependencies

Blog module depends on:
- `common` module (specified in module definition)
- `curator` module (for RichTextEditor component)
- `home` module (integrated via unifiedFeedService)
- `admin` module (BlogTab integration)

## Usage Examples

### Creating a Post via Admin UI

```javascript
// In BlogTab.jsx
const handleSave = async () => {
  const formDataObj = new FormData();
  formDataObj.append('title', formData.title);
  formDataObj.append('slug', formData.slug);
  formDataObj.append('excerpt', formData.excerpt);
  formDataObj.append('content', formData.content);
  formDataObj.append('published', formData.published);
  formDataObj.append('featured_on_homepage', formData.featured_on_homepage);

  if (formData.featured_image instanceof File) {
    formDataObj.append('featured_image', formData.featured_image);
  }

  if (editingPost) {
    await updateBlogPost(editingPost.id, formDataObj);
  } else {
    await createBlogPost(formDataObj);
  }

  loadPosts();
};
```

### Fetching Posts for Display

```javascript
// In a component
import { getPublishedBlogPosts } from '@modules/blog/services/blogService';

const [posts, setPosts] = useState([]);

useEffect(() => {
  const fetchPosts = async () => {
    try {
      const data = await getPublishedBlogPosts();
      setPosts(data);
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  };
  fetchPosts();
}, []);
```

### Rendering a Post Card

```javascript
import BlogPostCard from '@modules/blog/components/BlogPostCard';

{posts.map(post => (
  <BlogPostCard key={post.id} post={post} />
))}
```

### Displaying Full Post

```javascript
// Route automatically handled by module system
// Navigate to /posts/my-post-slug
// BlogPostDetail component renders automatically

import { Link } from 'react-router-dom';

<Link to={`/posts/${post.slug}`}>Read More</Link>
```

### Checking for Image Presence

```javascript
// In any component using post data
const hasImage = post.featured_image && post.featured_image.trim() !== '';

if (hasImage) {
  const imageUrl = getImageUrl(post.featured_image);
  // Render image
}
```

### Stripping HTML for Plain Text Display

```javascript
const stripHtml = (html) => {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

const plainText = stripHtml(post.excerpt);
// Use plainText for meta descriptions, previews, etc.
```

### Manual Flag Assignment

```javascript
// In backend code or API endpoint
const queries = getQueries();

// Assign flag to post
queries.assignBlogPostFlag.run(postId, flagId, adminUserId);

// Remove flag from post
queries.removeBlogPostFlag.run(postId, flagId);

// Get all flags for post
const flags = queries.getBlogPostFlags.all(postId);
```

### Integrating into Custom Feed

```javascript
import { getPublishedBlogPosts } from '@modules/blog/services/blogService';

const createCustomFeed = async () => {
  const posts = await getPublishedBlogPosts();

  // Filter posts by criteria
  const featuredPosts = posts.filter(p => p.featured_on_homepage);

  // Transform for display
  const feedItems = featuredPosts.map(post => ({
    ...post,
    type: 'post',
    displayDate: formatPostDate(post.published_at || post.created_at)
  }));

  return feedItems;
};
```

### Direct Database Query

```javascript
// In backend code
import { getQueries } from '@server/database/db';

const queries = getQueries();

// Get single post
const post = queries.getBlogPostById.get(1);

// Get all published posts
const published = queries.getPublishedBlogPosts.all();

// Create new post
const result = queries.insertBlogPost.run(
  slug, title, authorId, excerpt, content, featuredImage,
  published, publishedAt, featuredOnHomepage, homepageDisplayOrder
);

const newPostId = result.lastInsertRowid;
```

### Custom API Request

```javascript
// Fetching with custom parameters
const response = await fetch('/api/v1/blog-posts?published_only=true', {
  credentials: 'include'
});
const posts = await response.json();

// Creating post programmatically
const formData = new FormData();
formData.append('title', 'New Post');
formData.append('slug', 'new-post');
formData.append('content', '<p>Content here</p>');

const response = await fetch('/api/v1/blog-posts', {
  method: 'POST',
  credentials: 'include',
  body: formData
});
const newPost = await response.json();
```
