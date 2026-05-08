# Curator Type Display Toggle

## Purpose

Allows site administrators to hide curator type labels (e.g., "| LABEL", "| ARTIST", "| VENUE") sitewide while maintaining visibility on individual curator profile pages.

## How It Works

The setting is stored in admin_system_config table with config_key='hide_curator_type_sitewide' and config_value JSON containing enabled boolean (default false). SiteSettingsProvider (`src/shared/contexts/SiteSettingsContext.jsx`) wraps the application and fetches settings from `/api/v1/config/site-settings`, providing site-wide configuration to all components.

CuratorTypeDisplay component (`src/shared/components/CuratorTypeDisplay.jsx`) checks the setting via useSiteSettings() hook. When enabled is true, the component returns null to hide the type label. The forceShow prop overrides this behavior, used exclusively on CuratorProfilePage to ensure types remain visible on profile pages regardless of the global setting.

Special exception: The "flowerpil" curator type (displaying Flowerpil logo) is always shown regardless of toggle state as a branding element.

## API/Interface

### Public Endpoint

```
GET /api/v1/config/site-settings
```

Returns site-wide settings including curator type display toggle. No authentication required.

**Response:**
```json
{
  "hide_curator_type_sitewide": {
    "enabled": false
  }
}
```

### Admin Endpoint

```
PUT /api/v1/admin/system-config/hide_curator_type_sitewide
```

Updates the configuration value. Requires admin authentication.

**Request:**
```json
{
  "enabled": true
}
```

### Component Props

**CuratorTypeDisplay:**
```javascript
{
  type: string,        // 'label', 'artist', 'venue', 'flowerpil'
  forceShow: boolean  // Override global setting (default: false)
}
```

## Database

Configuration stored in `admin_system_config` table:

```sql
config_key: 'hide_curator_type_sitewide'
config_value: '{"enabled": false}'
config_type: 'system'
```

Default value set in `server/api/admin/systemConfig.js`.

## Integration Points

### Internal Dependencies

- **SiteSettingsContext** (`src/shared/contexts/SiteSettingsContext.jsx`) - Provides settings to all components
- **CuratorTypeDisplay** (`src/shared/components/CuratorTypeDisplay.jsx`) - Renders type labels with toggle awareness
- **useSiteSettings** hook - Consumes context in components
- **SiteDisplaySettings** (`src/modules/admin/components/SiteDisplaySettings.jsx`) - Admin UI for toggle control
- **OperationsTab** (`src/modules/admin/components/tabs/OperationsTab.jsx`) - Contains display settings section

### External Dependencies

- None - uses existing database and API infrastructure

### Frontend Implementation

From `src/App.jsx`:

```javascript
<SiteSettingsProvider>
  <ModuleProvider>
    {/* App routes */}
  </ModuleProvider>
</SiteSettingsProvider>
```

From `src/shared/components/CuratorTypeDisplay.jsx`:

```javascript
const { siteSettings } = useSiteSettings();
const shouldHide = siteSettings?.hide_curator_type_sitewide?.enabled && !forceShow;

if (shouldHide) return null;
```

## Configuration

No environment variables required. Setting managed through admin panel at Admin Panel → Operations → Site Display Settings.

## Usage Examples

### Default Behavior

From `src/modules/home/components/FeedPlaylistCard.jsx`:

```javascript
<CuratorTypeDisplay type={playlist.curator_type} />
```

Respects global setting - hides when toggle enabled.

### Force Show on Profile Page

From `src/modules/curator/components/CuratorProfilePage.jsx`:

```javascript
<CuratorTypeDisplay type={curator.type} forceShow={true} />
```

Always displays type regardless of global setting.

### Special Flowerpil Type

```javascript
if (type === 'flowerpil') {
  return <FlowerpilLogo />;  // Always shown
}
```

### Admin Toggle Update

From `src/modules/admin/components/SiteDisplaySettings.jsx`:

```javascript
const handleToggle = async (enabled) => {
  const response = await authenticatedFetch(
    '/api/v1/admin/system-config/hide_curator_type_sitewide',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    }
  );
};
```
