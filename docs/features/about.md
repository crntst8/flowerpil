# About Page

## Purpose

Provides an admin-editable public page at `/about` with optional custom header, top text section, and collapsible accordion sections. Administrators update content through a rich text editor with media support and custom spacing controls.

## How It Works

The About page consists of three optional sections: a custom header banner, always-visible top text, and collapsible accordion items. Content is stored in the database as JSON and cached on the frontend for performance.

### Frontend Components

**AboutPage** (`src/modules/about/components/AboutPage.jsx`) fetches content from `/api/v1/about-content` with dual-layer caching (memory and sessionStorage) using a 5-minute TTL. The component sanitizes all HTML content with DOMPurify before rendering. When headerConfig.showHeader is true, it displays a colored banner with title and subtitle. The top text section renders if topText is present. Accordion items are passed to the AboutAccordion component.

**AboutAccordion** (`src/modules/about/components/AboutAccordion.jsx`) renders accordion items in single-open mode where only one panel expands at a time. Each item supports media rendering (images or auto-playing videos) positioned at top, bottom, left, or right relative to text content. The component handles keyboard accessibility via Enter and Space keys, manages ARIA attributes, and provides smooth expand/collapse animations. Custom spacing fields (paddingTop, paddingBottom, paddingLeft, paddingRight, lineHeight) override default padding and line height when set.

**AboutPageEditor** (`src/modules/admin/components/AboutPageEditor.jsx`) provides the admin interface with three sections: custom header configuration (checkbox to enable, title, subtitle, and backgroundColor inputs), top text editor using TipTapEditor, and sortable accordion items managed by @dnd-kit. Each accordion item card includes a drag handle, title input, expand/collapse toggle, and remove button. When expanded, the item shows MediaUpload component for images/videos with position and aspect ratio selectors, TipTapEditor for rich HTML content, and spacing control inputs for fine-tuning padding and line height. Save validates all titles are non-empty, updates the database, and clears the public page cache.

### Data Flow

Admin saves content → POST to `/api/v1/admin/site-admin/about-content` → Database UPSERT to admin_system_config → Cache cleared via clearAboutContentCache() → Public page fetches fresh content on next visit.

Public page loads → Check memory cache → Check sessionStorage → Fetch from `/api/v1/about-content` → Cache in both locations → Sanitize HTML → Render components.

### Content Sanitization

DOMPurify sanitizes topText and all accordion item bodyHtml with allowed tags: p, br, strong, em, u, a, ul, ol, li, h1, h2, h3, span, div, s, del, mark, sub, sup, code, pre, blockquote, hr, img, table, thead, tbody, tr, th, td. Allowed attributes: href, target, rel, style, class, src, alt, width, height, colspan, rowspan, align.

### Media Rendering

When accordion item has mediaUrl and mediaType, the MediaContainer component renders based on mediaPosition. Images use the MediaImage component, videos use MediaVideo with autoPlay, loop, muted, and playsInline. Videos support mediaFallbackUrl as poster. The mediaAspectRatio sets CSS aspect-ratio (16/9, 4/3, 1/1, 21/9, or auto). Left/right positioning creates flex layout with media at 40% width minimum 280px, switching to column layout on mobile.

## API/Interface

### Public Endpoint

```
GET /api/v1/about-content
```

Returns about page content structure. No authentication required.

**Response:**
```json
{
  "topText": "<p>HTML content</p>",
  "headerConfig": {
    "showHeader": false,
    "title": "",
    "subtitle": "",
    "backgroundColor": "#667eea"
  },
  "items": [
    {
      "id": "item-1234567890",
      "title": "Section Title",
      "bodyHtml": "<p>HTML content</p>",
      "order": 0,
      "mediaUrl": "https://...",
      "mediaType": "image",
      "mediaPosition": "top",
      "mediaAspectRatio": "16/9",
      "mediaFallbackUrl": "https://...",
      "paddingTop": "20px",
      "paddingBottom": "20px",
      "paddingLeft": "20px",
      "paddingRight": "20px",
      "lineHeight": "1.8"
    }
  ]
}
```

### Admin Endpoints

```
GET /api/v1/admin/site-admin/about-content
POST /api/v1/admin/site-admin/about-content
```

Requires authentication via CSRF token validation.

**POST Request Body:**
```json
{
  "topText": "<p>HTML content</p>",
  "headerConfig": {
    "showHeader": true,
    "title": "Welcome",
    "subtitle": "Learn about us",
    "backgroundColor": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
  },
  "items": [
    {
      "id": "item-123",
      "title": "Required Title",
      "bodyHtml": "<p>Required HTML content</p>",
      "order": 0,
      "mediaUrl": "https://...",
      "mediaType": "image",
      "mediaPosition": "top",
      "mediaAspectRatio": "16/9",
      "mediaFallbackUrl": "",
      "paddingTop": "",
      "paddingBottom": "",
      "paddingLeft": "",
      "paddingRight": "",
      "lineHeight": ""
    }
  ]
}
```

**Validation Rules:**

- topText must be string (optional)
- headerConfig must be object with showHeader (boolean), title (string), subtitle (string), backgroundColor (string)
- items must be array
- Each item requires id (string), title (non-empty string), bodyHtml (string)
- mediaType must be 'image', 'video', or empty string
- mediaPosition must be 'top', 'bottom', 'left', 'right', or empty string
- Spacing fields (paddingTop, paddingBottom, paddingLeft, paddingRight, mediaAspectRatio, lineHeight) must be strings

**Response:**
```json
{
  "success": true
}
```

### Component Props

**AboutAccordion:**
```javascript
{
  items: Array // Array of accordion items
}
```

**clearAboutContentCache:**
```javascript
clearAboutContentCache() // Exported function from AboutPage.jsx
```

## Database

Content is stored in `admin_system_config` table:

**Table:** `admin_system_config`

**Row:**
- config_key: `'about_page_content'`
- config_value: JSON string containing topText, headerConfig, and items array
- config_type: `'system'`

**Data Structure in config_value:**
```sql
{
  "topText": "<p>Rich HTML content</p>",
  "headerConfig": {
    "showHeader": false,
    "title": "",
    "subtitle": "",
    "backgroundColor": "#667eea"
  },
  "items": [
    {
      "id": "item-1234567890",
      "title": "What We Do",
      "bodyHtml": "<p>Rich HTML content...</p>",
      "order": 0,
      "mediaUrl": "https://...",
      "mediaType": "image",
      "mediaPosition": "top",
      "mediaAspectRatio": "16/9",
      "mediaFallbackUrl": "",
      "paddingTop": "",
      "paddingBottom": "",
      "paddingLeft": "",
      "paddingRight": "",
      "lineHeight": ""
    }
  ]
}
```

**Query (Read):**
```sql
SELECT config_value
FROM admin_system_config
WHERE config_key = 'about_page_content'
```

**Query (Write):**
Database operations use UPSERT pattern in server/api/admin/siteAdmin.js:1296-1400.

## Integration Points

### Internal Dependencies

- **TipTapEditor** (`src/modules/curator/components/TipTapEditor.jsx`) - Rich text editing for topText and accordion item content
- **MediaUpload** (`src/modules/admin/components/MediaUpload.jsx`) - Handles image and video uploads for accordion items
- **ReusableHeader** (`src/shared/components/ReusableHeader.jsx`) - Navigation header on public page
- **GlobalStyles** (`src/shared/styles/GlobalStyles.js`) - Theme tokens for fonts, colors, spacing
- **adminApi** (`src/modules/admin/utils/adminApi.js`) - adminGet and adminPost functions for API calls

### External Dependencies

- **@dnd-kit/core** - Drag and drop core functionality
- **@dnd-kit/sortable** - Sortable list support for accordion reordering
- **@dnd-kit/utilities** - CSS transform utilities
- **isomorphic-dompurify** - HTML sanitization for XSS prevention
- **styled-components** - Component styling
- **react-router-dom** - Link component for breadcrumb navigation

### Route Registration

Public route registered in `server/index.js` as `/api/v1/about-content` pointing to `server/api/about.js`.

Admin routes live in `server/api/admin/siteAdmin.js` under `/api/v1/admin/site-admin/about-content` (GET/POST).

Frontend route `/about` renders AboutPage component.

### Admin Panel Integration
AboutPageEditor is lazy-loaded inside the Admin → Content tab (`src/modules/admin/components/tabs/ContentTab.jsx`) and appears in the "About Page" surface card alongside blog and search configuration panels.

## Configuration

No environment variables required. Feature uses existing database connection and authentication system.

## Usage Examples

### Accessing the Public Page

```javascript
// Visit the about page
window.location.href = '/about';
```

### Fetching Content Programmatically

```javascript
const response = await fetch('/api/v1/about-content');
const content = await response.json();
console.log(content.topText);
console.log(content.items);
```

### Clearing the Cache

```javascript
import { clearAboutContentCache } from '@modules/about/components/AboutPage';

// Clear cache after admin saves changes
clearAboutContentCache();
```

### Admin Save Operation

From `src/modules/admin/components/AboutPageEditor.jsx`:

```javascript
const payload = {
  topText,
  headerConfig,
  items: items.map((item, index) => ({
    ...item,
    order: index
  }))
};

await adminPost('/api/v1/admin/site-admin/about-content', payload);
clearAboutContentCache();
```

### Creating New Accordion Item

From `src/modules/admin/components/AboutPageEditor.jsx`:232-240:

```javascript
const newItem = {
  id: `item-${Date.now()}`,
  title: '',
  bodyHtml: '<p>New section content...</p>',
  order: items.length
};
setItems([...items, newItem]);
```

### Sanitizing HTML Content

From `src/modules/about/components/AboutPage.jsx`:102-115:

```javascript
const sanitizedTopText = content.topText
  ? DOMPurify.sanitize(content.topText, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3',
        'span', 'div', 's', 'del', 'mark', 'sub', 'sup', 'code', 'pre',
        'blockquote', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel', 'style', 'class', 'src', 'alt', 'width', 'height',
        'colspan', 'rowspan', 'align'
      ],
      ALLOW_DATA_ATTR: false
    })
  : '';
```

### Rendering Media in Accordion

From `src/modules/about/components/AboutAccordion.jsx`:556-579:

```javascript
const renderMedia = () => {
  if (!hasMedia) return null;

  return (
    <MediaContainer mediaPosition={mediaPosition} aspectRatio={mediaAspectRatio}>
      {item.mediaType === 'video' ? (
        <MediaVideo
          src={item.mediaUrl}
          autoPlay
          loop
          muted
          playsInline
          poster={item.mediaFallbackUrl}
        >
          {item.mediaFallbackUrl && (
            <source src={item.mediaFallbackUrl} type="image/jpeg" />
          )}
        </MediaVideo>
      ) : (
        <MediaImage src={item.mediaUrl} alt={item.title} />
      )}
    </MediaContainer>
  );
};
```

### Keyboard Navigation Handler

From `src/modules/about/components/AboutAccordion.jsx`:509-514:

```javascript
const handleKeyDown = useCallback((event, itemId) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleToggle(itemId);
  }
}, [handleToggle]);
```
