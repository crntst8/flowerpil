# Admin DSP Token Management API

**Base Path**: `/api/v1/admin/dsp`
**Authentication**: Admin role required + CSRF token
**Version**: 1.0 (2025-10-22)

## Overview

The DSP Token Management API provides monitoring and management capabilities for OAuth tokens used in automated playlist exports to Spotify, Apple Music, and TIDAL.

## Endpoints

### 1. List All Tokens

**GET** `/api/v1/admin/dsp/tokens`

List all DSP OAuth tokens with optional filtering.

**Query Parameters**:
- `platform` (optional): Filter by platform (`spotify`, `tidal`, `apple`)
- `health_status` (optional): Filter by health (`healthy`, `expiring`, `expired`, `revoked`, `unknown`)
- `is_active` (optional): Filter by active status (`1` or `0`)

**Example Request**:
```bash
curl -X GET "https://api.flowerpil.io/api/v1/admin/dsp/tokens?platform=spotify&is_active=1" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "platform": "spotify",
      "account_type": "flowerpil",
      "account_label": "flowerpil-primary",
      "owner_curator_id": null,
      "health_status": "healthy",
      "is_active": 1,
      "expires_at": "2025-10-23T10:00:00Z",
      "refresh_expires_at": "2025-12-22T10:00:00Z",
      "last_validated_at": "2025-10-22T20:00:00Z",
      "created_at": "2025-10-01T00:00:00Z",
      "updated_at": "2025-10-22T20:00:00Z",
      "expires_in_hours": 14,
      "has_refresh_token": true,
      "user_info": {
        "id": "flowerpil_spotify",
        "display_name": "Flowerpil"
      }
    }
  ],
  "count": 1
}
```

**Notes**:
- Actual `access_token` is never exposed
- Tokens are sanitized for security
- Use `expires_in_hours` for quick health assessment

---

### 2. Get Health Report

**GET** `/api/v1/admin/dsp/tokens/health`

Get comprehensive health report for all tokens with summary statistics.

**Example Request**:
```bash
curl -X GET "https://api.flowerpil.io/api/v1/admin/dsp/tokens/health" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 4,
      "healthy": 2,
      "expiring": 1,
      "expired": 0,
      "revoked": 0,
      "unknown": 1,
      "needsRefresh": 1,
      "platforms": {
        "spotify": 2,
        "tidal": 1,
        "apple": 1
      }
    },
    "platforms": {
      "spotify": [
        {
          "id": 1,
          "platform": "spotify",
          "account_label": "flowerpil-primary",
          "is_active": 1,
          "health_status": "healthy",
          "expires_at": "2025-10-25T10:00:00Z"
        }
      ]
    },
    "tokens": [
      {
        "id": 1,
        "platform": "spotify",
        "account_type": "flowerpil",
        "account_label": "flowerpil-primary",
        "is_active": 1,
        "health_status": "healthy",
        "expiry_urgency": "OK",
        "expires_at": "2025-10-25T10:00:00Z",
        "expires_in_hours": 72,
        "last_validated_at": "2025-10-22T20:00:00Z"
      }
    ]
  }
}
```

**Expiry Urgency Levels**:
- `OK`: Expires in > 48 hours
- `EXPIRING`: Expires in 24-48 hours
- `WARNING`: Expires in 1-24 hours
- `CRITICAL`: Expires in < 1 hour or already expired

---

### 3. Get Token Details

**GET** `/api/v1/admin/dsp/tokens/:id`

Get detailed information for a specific token.

**Path Parameters**:
- `id`: Token ID (integer)

**Example Request**:
```bash
curl -X GET "https://api.flowerpil.io/api/v1/admin/dsp/tokens/1" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "platform": "spotify",
    "account_type": "flowerpil",
    "account_label": "flowerpil-primary",
    "owner_curator_id": null,
    "health_status": "healthy",
    "is_active": 1,
    "expires_at": "2025-10-25T10:00:00Z",
    "refresh_expires_at": "2025-12-22T10:00:00Z",
    "last_validated_at": "2025-10-22T20:00:00Z",
    "created_at": "2025-10-01T00:00:00Z",
    "updated_at": "2025-10-22T20:00:00Z",
    "expires_in_hours": 72,
    "has_refresh_token": true,
    "user_info": {
      "id": "flowerpil_spotify",
      "display_name": "Flowerpil"
    },
    "access_token_preview": "BQDvI2kj2e..."
  }
}
```

**Notes**:
- `access_token_preview` shows first 10 characters for verification only
- Full token never exposed via API

---

### 4. Validate Token

**POST** `/api/v1/admin/dsp/tokens/:id/validate`

Validate a token by making an API call to the DSP platform.

**Path Parameters**:
- `id`: Token ID (integer)

**Example Request**:
```bash
curl -X POST "https://api.flowerpil.io/api/v1/admin/dsp/tokens/1/validate" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN"
```

**Response (Success)**:
```json
{
  "success": true,
  "data": {
    "token_id": 1,
    "valid": true,
    "error": null,
    "user_info": {
      "id": "flowerpil_spotify",
      "display_name": "Flowerpil",
      "email": "dev@flowerpil.io"
    },
    "validated_at": "2025-10-22T21:00:00Z"
  }
}
```

**Response (Failure)**:
```json
{
  "success": true,
  "data": {
    "token_id": 1,
    "valid": false,
    "error": "HTTP 401: Token expired",
    "user_info": null,
    "validated_at": "2025-10-22T21:00:00Z"
  }
}
```

**Notes**:
- Makes lightweight API call to platform (user profile endpoint)
- Updates `health_status` and `last_validated_at` in database
- Use to manually check token health on demand

---

### 5. Refresh All Health Statuses

**POST** `/api/v1/admin/dsp/tokens/refresh-health`

Refresh health status for all tokens based on expiration times.

**Example Request**:
```bash
curl -X POST "https://api.flowerpil.io/api/v1/admin/dsp/tokens/refresh-health" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "updated": 3,
    "unchanged": 1,
    "total": 4,
    "timestamp": "2025-10-22T21:00:00Z"
  }
}
```

**Notes**:
- Fast operation (milliseconds for dozens of tokens)
- Only updates tokens whose status changed
- Should be run periodically (e.g., hourly via cron)

---

### 6. Update Token Metadata

**PATCH** `/api/v1/admin/dsp/tokens/:id`

Update token metadata (health_status, is_active, account_label).

**Path Parameters**:
- `id`: Token ID (integer)

**Request Body**:
```json
{
  "health_status": "healthy",
  "is_active": 1,
  "account_label": "flowerpil-primary"
}
```

**Example Request**:
```bash
curl -X PATCH "https://api.flowerpil.io/api/v1/admin/dsp/tokens/1" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_active": 0}'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "platform": "spotify",
    "account_label": "flowerpil-primary",
    "health_status": "healthy",
    "is_active": 0,
    "updated_at": "2025-10-22T21:00:00Z"
  }
}
```

**Use Cases**:
- Deactivate primary token to switch to backup
- Update account label for clarity
- Manually override health status if needed

---

### 7. Delete Token

**DELETE** `/api/v1/admin/dsp/tokens/:id`

Delete a token (use with caution).

**Path Parameters**:
- `id`: Token ID (integer)

**Example Request**:
```bash
curl -X DELETE "https://api.flowerpil.io/api/v1/admin/dsp/tokens/2" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "deleted_token_id": 2,
    "platform": "spotify",
    "account_label": "flowerpil-backup"
  }
}
```

**Restrictions**:
- Cannot delete active tokens (`is_active=1`)
- Must deactivate token first via PATCH endpoint
- Irreversible operation - use with caution

---

## Health Status Values

| Status | Description | Action Required |
|--------|-------------|-----------------|
| `healthy` | Token valid, expires > 48h | None |
| `expiring` | Token expires within 48h | Refresh soon |
| `expired` | Token past expiration | Refresh immediately |
| `revoked` | User revoked authorization | Re-authenticate |
| `unknown` | Health not yet determined | Run validation |

## Error Responses

**400 Bad Request**:
```json
{
  "success": false,
  "error": "Validation error",
  "details": "Invalid token ID"
}
```

**404 Not Found**:
```json
{
  "success": false,
  "error": "Token not found"
}
```

**500 Internal Server Error**:
```json
{
  "success": false,
  "error": "Failed to get token details"
}
```

## Security Notes

1. **Authentication**: All endpoints require admin role
2. **CSRF Protection**: CSRF token required for all requests
3. **Token Sanitization**: Access tokens never exposed in responses
4. **Token Preview**: Only first 10 characters shown for verification
5. **Audit Trail**: Consider logging all token management operations

## Best Practices

1. **Health Monitoring**: Run `/tokens/refresh-health` hourly via cron
2. **Token Rotation**: Use `/tokens/:id/validate` before rotating
3. **Backup Tokens**: Keep `is_active=0` backup for each platform
4. **Alert Thresholds**: Monitor `needsRefresh` count in health report
5. **Expiry Urgency**: Act on `CRITICAL` and `WARNING` tokens immediately

## Integration Example

```javascript
// Fetch health report
const response = await fetch('/api/v1/admin/dsp/tokens/health', {
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'X-CSRF-Token': csrfToken
  }
});

const { data } = await response.json();

// Check for critical tokens
if (data.summary.expired > 0 || data.summary.needsRefresh > 0) {
  console.warn('⚠️ Token attention required!');

  // Show alerts for critical tokens
  data.tokens
    .filter(t => t.expiry_urgency === 'CRITICAL')
    .forEach(token => {
      alert(`${token.platform} token expires in ${token.expires_in_hours}h`);
    });
}
```

## Related Documentation

- [Export Request System Overview](../features/export-request-overview.md)
- [Token Health Service](../../server/services/tokenHealthService.js)
- [DSP Automation Implementation Guide](../../llm/features/wip/dsp-automate/IMPLEMENT.json)

---

**Last Updated**: 2025-10-22
**API Version**: 1.0
**Contact**: dev@flowerpil.io
