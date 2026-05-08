# QR Code Generation & CTA Banners

This document outlines the implementation of the QR code generation for playlists and the associated customizable Call-to-Action (CTA) banner system with A/B testing.

## QR Code Generation

QR codes for playlists provide a simple way for users to share and access playlists from physical media or other devices. All QR codes append `?ref=qr` to the playlist URL to trigger CTA display.

### Frontend Implementation

- **`src/shared/components/QRCode/QRCodeModal.jsx`**: A reusable modal component that displays a QR code for a given URL. Built using `ModalRoot` and `qrcode.react`.

- **`src/modules/playlists/components/PlaylistShareModal.jsx`**: The share modal includes a "Show QR Code" option that generates a QR code with `?ref=qr` appended.

- **`src/modules/curator/components/CuratorDashboard.jsx`**: A "QR Code" button in `RowActions` for each published playlist. URL includes `?ref=qr`.

## CTA Banner System with A/B Testing

Administrators can create CTA banners with A/B variants displayed to users visiting via QR code links.

### Database Schema

**Table: `qr_code_ctas`**
- **Migration**: `server/database/migrations/085_qr_code_ctas.js` (base), `086_qr_cta_ab_testing.js` (A/B)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary Key |
| `name` | TEXT | Internal identifier |
| `enabled` | BOOLEAN | Active/inactive toggle |
| `target_curator_id` | INTEGER | Curator-specific (NULL = global) |
| `variant_a_headline` | TEXT | Variant A banner text |
| `variant_a_link` | TEXT | Variant A destination URL |
| `variant_a_cta_text` | TEXT | Variant A button text |
| `variant_b_headline` | TEXT | Variant B banner text |
| `variant_b_link` | TEXT | Variant B destination URL |
| `variant_b_cta_text` | TEXT | Variant B button text |
| `assignment_counter` | INTEGER | Round-robin counter for A/B assignment |
| `impressions`, `clicks` | INTEGER | Legacy counters (backwards compat) |

**Table: `qr_cta_analytics`**
- Detailed event tracking for A/B analytics

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary Key |
| `cta_id` | INTEGER | FK to qr_code_ctas |
| `variant` | TEXT | 'A' or 'B' |
| `event_type` | TEXT | 'impression', 'click', 'dismiss' |
| `time_to_action` | INTEGER | Milliseconds from display to action |
| `playlist_id` | INTEGER | Which playlist was viewed |
| `created_at` | DATETIME | Event timestamp |

### A/B Assignment Logic

1. First-time visitors: Server assigns variant via round-robin (A, B, A, B...)
2. Frontend stores assigned variant in `localStorage` (`qr_cta_variant`)
3. Returning visitors: Same variant from localStorage sent to API
4. Even 50/50 distribution across all users

### API Endpoints

#### Admin API (`server/api/admin/qrCodeCtas.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/qr-ctas` | List all CTAs |
| POST | `/api/v1/admin/qr-ctas` | Create CTA with A/B variants |
| PUT | `/api/v1/admin/qr-ctas/:id` | Update CTA |
| DELETE | `/api/v1/admin/qr-ctas/:id` | Delete CTA |
| GET | `/api/v1/admin/qr-ctas/analytics?days=30` | A/B test analytics |

**Analytics Response:**
```json
{
  "success": true,
  "data": {
    "period": { "days": 30, "startDate": "...", "endDate": "..." },
    "variantA": {
      "impressions": 150,
      "clicks": 12,
      "clickThroughRate": "8.00",
      "dismissals": 45,
      "dismissalRate": "30.00",
      "avgTimeToClick": 3500
    },
    "variantB": { ... },
    "totals": { "impressions": 300, "clicks": 25, "dismissals": 90 }
  }
}
```

#### Public API (`server/api/qrCodeCtas.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/qr-ctas?playlistId=X&variant=A` | Fetch CTA (variant optional) |
| POST | `/api/v1/qr-ctas/:id/track` | Track click/dismiss events |

**GET Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "variant": "A",
    "headline": "follow us for new music",
    "link": "https://instagram.com/flowerpil",
    "cta_text": "Follow Now",
    "playlist_id": 123
  }
}
```

**POST /track Body:**
```json
{
  "variant": "A",
  "eventType": "click",
  "timeToAction": 4500,
  "playlistId": 123
}
```

### Frontend Components

#### PlaylistView.jsx
- Detects `?ref=qr` parameter
- Checks localStorage for existing variant assignment
- Fetches CTA with variant param if available
- Stores new variant assignment in localStorage
- Renders dismissible banner

#### QRCodeCTABanner.jsx
- Displays CTA banner at top of playlist page
- Dismiss (X) button to hide banner
- Tracks time from display to click/dismiss
- Calls `/track` endpoint on user interaction

#### QRCodeCTAManager.jsx (Admin)
- Location: Site Admin > Operations > QR CTAs
- Two-column form for Variant A / Variant B content
- Enable/disable toggle
- Target curator selector (global or curator-specific)
- Analytics grid showing per-variant performance:
  - Impressions
  - Click-through rate
  - Dismissal rate
  - Average time to click

### CTA Selection Priority

1. Curator-specific CTA (if `target_curator_id` matches playlist curator)
2. Global CTA (if `target_curator_id` is NULL)
3. No CTA displayed (if none enabled)

### Testing Checklist

1. **QR URL**: Verify QR codes include `?ref=qr` parameter
2. **CTA Display**: Create enabled CTA, scan QR, verify banner appears
3. **A/B Assignment**: Clear localStorage, visit twice with different browsers, verify even distribution
4. **Dismiss**: Click X, verify banner hides and dismiss event tracked
5. **Analytics**: Check admin panel shows accurate impressions/clicks/dismissals per variant
