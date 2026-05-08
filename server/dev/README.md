# Dev Testing Utilities

Quick testing tools for rapid development without authentication friction.

## 🌱 Seed Test Users

Creates pre-configured test accounts with simple credentials:

```bash
npm run seed:users
```

**Test Accounts:**
- `test@test.com` / `password` - Regular user
- `curator@test.com` / `password` - Curator account
- `private@test.com` / `password` - Private profile user

## 🔓 Quick Login API (Dev Only)

Bypass password verification for instant auth:

**Endpoint:** `POST /api/v1/auth/dev/quick-login`

```bash
curl -X POST http://localhost:3000/api/v1/auth/dev/quick-login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com"}'
```

**Only available when `NODE_ENV=development`**

## 👤 Dev User Switcher UI Component

Floating panel for instant user switching in the browser.

**Setup:** Add to your root component (e.g., `App.jsx`):

```jsx
import DevUserSwitcher from './dev/DevUserSwitcher';

function App() {
  return (
    <>
      {import.meta.env.DEV && <DevUserSwitcher />}
      {/* rest of your app */}
    </>
  );
}
```

**Usage:**
- Click the blue user icon (bottom-right)
- Click any test user to instant-login
- Keyboard shortcut: `⌘K` / `Ctrl+K`

## 🎯 Quick Testing Workflows

### Test saved tracks:
```bash
npm run seed:users
# Open browser → click DevUserSwitcher → login as test@test.com
# Test save/unsave functionality
```

### Test privacy settings:
```bash
# Login as private@test.com via switcher
# Verify saved tracks are private
# Switch to test@test.com
# Verify cannot access private user's saved page
```

### Test curator features:
```bash
# Login as curator@test.com
# Test playlist creation/management
```

## ⚠️ Security Notes

- **All dev endpoints disabled in production** (NODE_ENV check)
- **Seed script refuses to run in production**
- **DevUserSwitcher hidden when `!import.meta.env.DEV`**
- **Quick-login logs clearly marked `[DEV_QUICK_LOGIN]`**

## 📝 Adding More Test Users

Edit `server/dev/seedTestUsers.js`:

```js
const testUsers = [
  // ... existing users
  {
    email: 'newuser@test.com',
    username: 'newuser',
    password: 'password',
    displayName: 'New Test User',
    bio: 'Another test account',
    isPrivateSaved: 0
  }
];
```

Then run `npm run seed:users` again.