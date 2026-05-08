/**
 * Admin Users API
 * Endpoints for managing public users from the admin panel
 */

import express from 'express';
import { getQueries } from '../database/db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { logSecurityEvent, SECURITY_EVENTS } from '../utils/securityLogger.js';
import { sendAdminEmail } from '../utils/emailService.js';

const router = express.Router();

// All routes require admin authentication
router.use(authMiddleware);
router.use(requireAdmin);

/**
 * GET /api/v1/admin/users
 * List public users with pagination and filters
 */
router.get('/', (req, res) => {
  try {
    const queries = getQueries();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim() || '';

    let users;
    let total;

    if (search) {
      const searchPattern = `%${search}%`;
      users = queries.searchPublicUsers.all(searchPattern, searchPattern, searchPattern, limit, offset);
      total = queries.countSearchPublicUsers.get(searchPattern, searchPattern, searchPattern)?.count || 0;
    } else {
      users = queries.getPublicUsersPaginated.all(limit, offset);
      total = queries.countPublicUsers.get()?.count || 0;
    }

    // Parse badges JSON for each user
    const formattedUsers = users.map(user => ({
      ...user,
      badges: safeParseJSON(user.badges, [])
    }));

    return res.json({
      success: true,
      data: {
        users: formattedUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('[admin-users] Error listing users:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to list users'
    });
  }
});

/**
 * GET /api/v1/admin/users/analytics/summary
 * Get aggregate stats for public users
 * NOTE: Must be defined before /:id to avoid route conflicts
 */
router.get('/analytics/summary', (req, res) => {
  try {
    const queries = getQueries();

    const userStats = queries.getPublicUserSignupStats.get();
    const importStats = queries.getPublicUserImportStats.get();
    const pendingRequests = queries.countPendingExportAccessRequests.get();

    return res.json({
      success: true,
      data: {
        users: {
          total: userStats?.total || 0,
          last7Days: userStats?.last_7_days || 0,
          last30Days: userStats?.last_30_days || 0,
          verified: userStats?.verified_count || 0,
          exportsUnlocked: userStats?.exports_unlocked_count || 0,
          suspended: userStats?.suspended_count || 0
        },
        imports: {
          total: importStats?.total_imports || 0,
          uniqueUsers: importStats?.unique_users || 0,
          last7Days: importStats?.last_7_days || 0
        },
        exportRequests: {
          pending: pendingRequests?.count || 0
        }
      }
    });
  } catch (error) {
    console.error('[admin-users] Error getting analytics:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get analytics'
    });
  }
});

/**
 * POST /api/v1/admin/users/bulk-action
 * Perform bulk action on multiple users
 * NOTE: Must be defined before /:id to avoid route conflicts
 */
router.post('/bulk-action', (req, res) => {
  try {
    const queries = getQueries();
    const { userIds, action, reason } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userIds must be a non-empty array'
      });
    }

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required for bulk actions'
      });
    }

    const validActions = ['suspend', 'restore', 'restrict', 'unlock_exports'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action. Valid actions: ${validActions.join(', ')}`
      });
    }

    let successCount = 0;
    let failCount = 0;

    for (const userId of userIds) {
      try {
        const user = queries.getUserById.get(userId);
        if (!user) {
          failCount++;
          continue;
        }

        switch (action) {
          case 'suspend':
            queries.updateUserStatus.run('suspended', reason.trim(), req.user.id, userId);
            break;
          case 'restore':
            queries.updateUserStatus.run('active', reason.trim(), req.user.id, userId);
            break;
          case 'restrict':
            queries.updateUserStatus.run('restricted', reason.trim(), req.user.id, userId);
            break;
          case 'unlock_exports':
            queries.updateUserExportsUnlocked.run(1, 1, req.user.id, userId);
            break;
        }

        // Log the action
        queries.insertAdminUserAction.run(
          req.user.id,
          userId,
          'user',
          action === 'restore' ? 'unsuspend' : action,
          reason.trim(),
          JSON.stringify({ bulk: true })
        );

        successCount++;
      } catch (userError) {
        console.error(`[admin-users] Bulk action failed for user ${userId}:`, userError.message);
        failCount++;
      }
    }

    // Log bulk action security event
    if (successCount > 0) {
      logSecurityEvent(SECURITY_EVENTS.PUBLIC_USER_SUSPENDED, {
        action,
        successCount,
        failCount,
        adminId: req.user.id,
        adminUsername: req.user.username,
        reason: reason.trim(),
        ipAddress: req.ip,
        bulk: true
      });
    }

    return res.json({
      success: true,
      data: {
        success: successCount,
        failed: failCount,
        total: userIds.length
      }
    });
  } catch (error) {
    console.error('[admin-users] Error performing bulk action:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to perform bulk action'
    });
  }
});

/**
 * GET /api/v1/admin/users/export-requests
 * Get pending export access requests
 * NOTE: Must be defined before /:id to avoid route conflicts
 */
router.get('/export-requests', (req, res) => {
  try {
    const queries = getQueries();
    const requests = queries.getPendingExportAccessRequests.all();

    return res.json({
      success: true,
      data: { requests }
    });
  } catch (error) {
    console.error('[admin-users] Error getting export requests:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get export requests'
    });
  }
});

/**
 * POST /api/v1/admin/users/export-requests/:id/approve
 * Approve an export access request
 */
router.post('/export-requests/:id/approve', (req, res) => {
  try {
    const queries = getQueries();
    const requestId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    // Get the request to find the user
    const request = queries.getExportAccessRequestByUser?.get(requestId);

    // Update request status
    queries.updateExportAccessRequest.run('approved', req.user.id, reason?.trim() || 'Approved', requestId);

    // Unlock exports for the user
    if (request) {
      queries.updateUserExportsUnlocked.run(1, 1, req.user.id, request.user_id);

      // Log the action
      queries.insertAdminUserAction.run(
        req.user.id,
        request.user_id,
        'user',
        'unlock_exports',
        reason?.trim() || 'Export access request approved',
        JSON.stringify({ requestId })
      );
    }

    return res.json({
      success: true,
      message: 'Export access request approved'
    });
  } catch (error) {
    console.error('[admin-users] Error approving request:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to approve request'
    });
  }
});

/**
 * POST /api/v1/admin/users/export-requests/:id/deny
 * Deny an export access request
 */
router.post('/export-requests/:id/deny', (req, res) => {
  try {
    const queries = getQueries();
    const requestId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required for denial'
      });
    }

    queries.updateExportAccessRequest.run('denied', req.user.id, reason.trim(), requestId);

    return res.json({
      success: true,
      message: 'Export access request denied'
    });
  } catch (error) {
    console.error('[admin-users] Error denying request:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to deny request'
    });
  }
});

/**
 * GET /api/v1/admin/users/:id
 * Get user details for audit panel
 */
router.get('/:id', (req, res) => {
  try {
    const queries = getQueries();
    const userId = parseInt(req.params.id, 10);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const user = queries.getUserById.get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get action history
    const actions = queries.getAdminUserActionsByTarget.all(userId, 'user', 20, 0);

    // Get import usage
    const importCount = queries.getUserImportCountLast24h.get(userId);

    // Get export request status
    const exportRequest = queries.getExportAccessRequestByUser.get(userId);

    return res.json({
      success: true,
      data: {
        user: {
          ...user,
          badges: safeParseJSON(user.badges, [])
        },
        actionHistory: actions,
        importUsage: {
          last24h: importCount?.count || 0
        },
        exportRequest: exportRequest || null
      }
    });
  } catch (error) {
    console.error('[admin-users] Error getting user:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user details'
    });
  }
});

/**
 * GET /api/v1/admin/users/:id/actions
 * Get action history for a user
 */
router.get('/:id/actions', (req, res) => {
  try {
    const queries = getQueries();
    const userId = parseInt(req.params.id, 10);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const offset = parseInt(req.query.offset, 10) || 0;

    const actions = queries.getAdminUserActionsByTarget.all(userId, 'user', limit, offset);

    return res.json({
      success: true,
      data: { actions }
    });
  } catch (error) {
    console.error('[admin-users] Error getting actions:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get action history'
    });
  }
});

/**
 * POST /api/v1/admin/users/:id/suspend
 * Suspend a user account
 */
router.post('/:id/suspend', (req, res) => {
  try {
    const queries = getQueries();
    const userId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required for suspension'
      });
    }

    const user = queries.getUserById.get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update user status
    queries.updateUserStatus.run('suspended', reason.trim(), req.user.id, userId);

    // Log the action
    queries.insertAdminUserAction.run(
      req.user.id,
      userId,
      'user',
      'suspend',
      reason.trim(),
      null
    );

    // Log security event
    logSecurityEvent(SECURITY_EVENTS.PUBLIC_USER_SUSPENDED, {
      userId,
      email: user.email,
      adminId: req.user.id,
      adminUsername: req.user.username,
      reason: reason.trim(),
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'User suspended successfully'
    });
  } catch (error) {
    console.error('[admin-users] Error suspending user:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to suspend user'
    });
  }
});

/**
 * POST /api/v1/admin/users/:id/unsuspend
 * Restore a suspended user account
 */
router.post('/:id/unsuspend', (req, res) => {
  try {
    const queries = getQueries();
    const userId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required'
      });
    }

    const user = queries.getUserById.get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update user status
    queries.updateUserStatus.run('active', reason.trim(), req.user.id, userId);

    // Log the action
    queries.insertAdminUserAction.run(
      req.user.id,
      userId,
      'user',
      'unsuspend',
      reason.trim(),
      null
    );

    return res.json({
      success: true,
      message: 'User unsuspended successfully'
    });
  } catch (error) {
    console.error('[admin-users] Error unsuspending user:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to unsuspend user'
    });
  }
});

/**
 * POST /api/v1/admin/users/:id/restrict
 * Apply restrictions to a user account
 */
router.post('/:id/restrict', (req, res) => {
  try {
    const queries = getQueries();
    const userId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required'
      });
    }

    const user = queries.getUserById.get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update user status
    queries.updateUserStatus.run('restricted', reason.trim(), req.user.id, userId);

    // Log the action
    queries.insertAdminUserAction.run(
      req.user.id,
      userId,
      'user',
      'restrict',
      reason.trim(),
      null
    );

    logSecurityEvent(SECURITY_EVENTS.PUBLIC_USER_RESTRICTED, {
      userId,
      email: user.email,
      adminId: req.user.id,
      reason: reason.trim(),
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'User restricted successfully'
    });
  } catch (error) {
    console.error('[admin-users] Error restricting user:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to restrict user'
    });
  }
});

/**
 * POST /api/v1/admin/users/:id/revoke
 * Permanently revoke user access
 */
router.post('/:id/revoke', (req, res) => {
  try {
    const queries = getQueries();
    const userId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required'
      });
    }

    const user = queries.getUserById.get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update user status and deactivate
    queries.updateUserStatus.run('revoked', reason.trim(), req.user.id, userId);
    queries.updateUserActive.run(0, userId);

    // Log the action
    queries.insertAdminUserAction.run(
      req.user.id,
      userId,
      'user',
      'revoke',
      reason.trim(),
      null
    );

    logSecurityEvent(SECURITY_EVENTS.PUBLIC_USER_REVOKED, {
      userId,
      email: user.email,
      adminId: req.user.id,
      reason: reason.trim(),
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'User access revoked'
    });
  } catch (error) {
    console.error('[admin-users] Error revoking user:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to revoke user'
    });
  }
});

/**
 * POST /api/v1/admin/users/:id/unlock-exports
 * Unlock export access for a user
 */
router.post('/:id/unlock-exports', (req, res) => {
  try {
    const queries = getQueries();
    const userId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required'
      });
    }

    const user = queries.getUserById.get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Unlock exports
    queries.updateUserExportsUnlocked.run(1, 1, req.user.id, userId);

    // Log the action
    queries.insertAdminUserAction.run(
      req.user.id,
      userId,
      'user',
      'unlock_exports',
      reason.trim(),
      null
    );

    logSecurityEvent(SECURITY_EVENTS.PUBLIC_USER_EXPORTS_UNLOCKED, {
      userId,
      email: user.email,
      adminId: req.user.id,
      reason: reason.trim(),
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'Exports unlocked successfully'
    });
  } catch (error) {
    console.error('[admin-users] Error unlocking exports:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to unlock exports'
    });
  }
});

/**
 * POST /api/v1/admin/users/:id/badge
 * Add or remove a badge from a user
 */
router.post('/:id/badge', (req, res) => {
  try {
    const queries = getQueries();
    const userId = parseInt(req.params.id, 10);
    const { badge, action, reason } = req.body;

    if (!badge?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Badge name is required'
      });
    }

    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Action must be "add" or "remove"'
      });
    }

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required'
      });
    }

    const user = queries.getUserById.get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Parse current badges
    const badges = safeParseJSON(user.badges, []);

    if (action === 'add') {
      if (!badges.includes(badge.trim())) {
        badges.push(badge.trim());
      }
    } else {
      const index = badges.indexOf(badge.trim());
      if (index > -1) {
        badges.splice(index, 1);
      }
    }

    // Update badges
    queries.updateUserBadges.run(JSON.stringify(badges), userId);

    // Log the action
    queries.insertAdminUserAction.run(
      req.user.id,
      userId,
      'user',
      action === 'add' ? 'badge_add' : 'badge_remove',
      reason.trim(),
      JSON.stringify({ badge: badge.trim() })
    );

    return res.json({
      success: true,
      message: `Badge ${action === 'add' ? 'added' : 'removed'} successfully`,
      badges
    });
  } catch (error) {
    console.error('[admin-users] Error updating badge:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to update badge'
    });
  }
});

/**
 * POST /api/v1/admin/users/send-email
 * Send email to selected users, a group, or all users
 */
router.post('/send-email', async (req, res) => {
  try {
    const queries = getQueries();
    const { userIds, groupId, sendToAll, subject, body } = req.body;

    if (!subject?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Subject is required'
      });
    }

    if (!body?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Email body is required'
      });
    }

    // Determine recipient emails
    let emails = [];

    if (sendToAll) {
      // Get all public user emails
      const users = queries.getAllPublicUsers.all();
      emails = users.map(u => u.email).filter(Boolean);
    } else if (groupId) {
      // Get emails from group members
      const members = queries.getUserGroupMembers.all(groupId);
      emails = members.map(m => m.email).filter(Boolean);
    } else if (Array.isArray(userIds) && userIds.length > 0) {
      // Get emails for specific user IDs
      for (const userId of userIds) {
        const user = queries.getUserById.get(userId);
        if (user?.email) {
          emails.push(user.email);
        }
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Specify userIds, groupId, or sendToAll'
      });
    }

    if (emails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid email recipients found'
      });
    }

    // Send emails (use BCC for privacy when sending to multiple)
    let successCount = 0;
    let failCount = 0;

    // For bulk emails, send in batches to avoid rate limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);

      for (const email of batch) {
        try {
          await sendAdminEmail({
            to: email,
            subject: subject.trim(),
            body: body.trim()
          });
          successCount++;
        } catch (emailError) {
          console.error(`[admin-users] Failed to send email to ${email}:`, emailError.message);
          failCount++;
        }
      }

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Log the action
    queries.insertAdminUserAction.run(
      req.user.id,
      0, // No specific target user
      'system',
      'send_email',
      `Sent email: "${subject.trim()}"`,
      JSON.stringify({
        recipientCount: emails.length,
        successCount,
        failCount,
        sendToAll: !!sendToAll,
        groupId: groupId || null
      })
    );

    return res.json({
      success: true,
      data: {
        sent: successCount,
        failed: failCount,
        total: emails.length
      }
    });
  } catch (error) {
    console.error('[admin-users] Error sending email:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to send emails'
    });
  }
});

/**
 * GET /api/v1/admin/users/email-templates
 * Get all email templates
 */
router.get('/email-templates', (req, res) => {
  try {
    const queries = getQueries();
    const templates = queries.getAllEmailTemplates.all();

    return res.json({
      success: true,
      data: { templates }
    });
  } catch (error) {
    console.error('[admin-users] Error getting templates:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get email templates'
    });
  }
});

/**
 * POST /api/v1/admin/users/email-templates
 * Create a new email template
 */
router.post('/email-templates', (req, res) => {
  try {
    const queries = getQueries();
    const { name, subject, body } = req.body;

    if (!name?.trim() || !subject?.trim() || !body?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Name, subject, and body are required'
      });
    }

    const result = queries.createEmailTemplate.run(
      name.trim(),
      subject.trim(),
      body.trim(),
      req.user.id
    );

    return res.json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        name: name.trim(),
        subject: subject.trim()
      }
    });
  } catch (error) {
    console.error('[admin-users] Error creating template:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to create email template'
    });
  }
});

/**
 * DELETE /api/v1/admin/users/email-templates/:id
 * Delete an email template
 */
router.delete('/email-templates/:id', (req, res) => {
  try {
    const queries = getQueries();
    const templateId = parseInt(req.params.id, 10);

    queries.deleteEmailTemplate.run(templateId);

    return res.json({
      success: true,
      message: 'Template deleted'
    });
  } catch (error) {
    console.error('[admin-users] Error deleting template:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete template'
    });
  }
});

// Helper to safely parse JSON
function safeParseJSON(str, defaultValue = null) {
  try {
    return JSON.parse(str) || defaultValue;
  } catch {
    return defaultValue;
  }
}

export default router;
