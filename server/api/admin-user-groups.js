/**
 * Admin User Groups API
 * Endpoints for managing user groups for bulk operations
 */

import express from 'express';
import { getQueries } from '../database/db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// All routes require admin authentication
router.use(authMiddleware);
router.use(requireAdmin);

/**
 * GET /api/v1/admin/user-groups
 * List all user groups with member counts
 */
router.get('/', (req, res) => {
  try {
    const queries = getQueries();
    const groups = queries.getAllUserGroups.all();

    return res.json({
      success: true,
      data: { groups }
    });
  } catch (error) {
    console.error('[admin-user-groups] Error listing groups:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to list groups'
    });
  }
});

/**
 * POST /api/v1/admin/user-groups
 * Create a new user group
 */
router.post('/', (req, res) => {
  try {
    const queries = getQueries();
    const { name, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Group name is required'
      });
    }

    const result = queries.createUserGroup.run(name.trim(), description?.trim() || null, req.user.id);

    return res.json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        name: name.trim(),
        description: description?.trim() || null
      }
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({
        success: false,
        error: 'A group with this name already exists'
      });
    }
    console.error('[admin-user-groups] Error creating group:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to create group'
    });
  }
});

/**
 * GET /api/v1/admin/user-groups/:id
 * Get group details with member list
 */
router.get('/:id', (req, res) => {
  try {
    const queries = getQueries();
    const groupId = parseInt(req.params.id, 10);

    const group = queries.getUserGroupById.get(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    const members = queries.getUserGroupMembers.all(groupId);

    return res.json({
      success: true,
      data: {
        group,
        members
      }
    });
  } catch (error) {
    console.error('[admin-user-groups] Error getting group:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get group details'
    });
  }
});

/**
 * PUT /api/v1/admin/user-groups/:id
 * Update group name/description
 */
router.put('/:id', (req, res) => {
  try {
    const queries = getQueries();
    const groupId = parseInt(req.params.id, 10);
    const { name, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Group name is required'
      });
    }

    const group = queries.getUserGroupById.get(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    queries.updateUserGroup.run(name.trim(), description?.trim() || null, groupId);

    return res.json({
      success: true,
      message: 'Group updated successfully'
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({
        success: false,
        error: 'A group with this name already exists'
      });
    }
    console.error('[admin-user-groups] Error updating group:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to update group'
    });
  }
});

/**
 * DELETE /api/v1/admin/user-groups/:id
 * Delete a group
 */
router.delete('/:id', (req, res) => {
  try {
    const queries = getQueries();
    const groupId = parseInt(req.params.id, 10);

    const group = queries.getUserGroupById.get(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    queries.deleteUserGroup.run(groupId);

    return res.json({
      success: true,
      message: 'Group deleted successfully'
    });
  } catch (error) {
    console.error('[admin-user-groups] Error deleting group:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete group'
    });
  }
});

/**
 * POST /api/v1/admin/user-groups/:id/members
 * Add users to a group
 */
router.post('/:id/members', (req, res) => {
  try {
    const queries = getQueries();
    const groupId = parseInt(req.params.id, 10);
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userIds must be a non-empty array'
      });
    }

    const group = queries.getUserGroupById.get(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    let addedCount = 0;
    for (const userId of userIds) {
      try {
        const result = queries.addUserToGroup.run(groupId, userId, req.user.id);
        if (result.changes > 0) addedCount++;
      } catch (err) {
        console.error(`[admin-user-groups] Failed to add user ${userId}:`, err.message);
      }
    }

    return res.json({
      success: true,
      data: {
        added: addedCount,
        total: userIds.length
      }
    });
  } catch (error) {
    console.error('[admin-user-groups] Error adding members:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to add members'
    });
  }
});

/**
 * DELETE /api/v1/admin/user-groups/:id/members
 * Remove users from a group
 */
router.delete('/:id/members', (req, res) => {
  try {
    const queries = getQueries();
    const groupId = parseInt(req.params.id, 10);
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userIds must be a non-empty array'
      });
    }

    let removedCount = 0;
    for (const userId of userIds) {
      try {
        const result = queries.removeUserFromGroup.run(groupId, userId);
        if (result.changes > 0) removedCount++;
      } catch (err) {
        console.error(`[admin-user-groups] Failed to remove user ${userId}:`, err.message);
      }
    }

    return res.json({
      success: true,
      data: {
        removed: removedCount,
        total: userIds.length
      }
    });
  } catch (error) {
    console.error('[admin-user-groups] Error removing members:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to remove members'
    });
  }
});

/**
 * POST /api/v1/admin/user-groups/:id/bulk-action
 * Apply a bulk action to all members of a group
 */
router.post('/:id/bulk-action', (req, res) => {
  try {
    const queries = getQueries();
    const groupId = parseInt(req.params.id, 10);
    const { action, reason } = req.body;

    const group = queries.getUserGroupById.get(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
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

    // Get all member IDs
    const memberRows = queries.getUserGroupMemberIds.all(groupId);
    const userIds = memberRows.map(r => r.user_id);

    if (userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Group has no members'
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
          JSON.stringify({ bulk: true, groupId, groupName: group.name })
        );

        successCount++;
      } catch (userError) {
        console.error(`[admin-user-groups] Bulk action failed for user ${userId}:`, userError.message);
        failCount++;
      }
    }

    return res.json({
      success: true,
      data: {
        success: successCount,
        failed: failCount,
        total: userIds.length,
        groupName: group.name
      }
    });
  } catch (error) {
    console.error('[admin-user-groups] Error performing bulk action:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to perform bulk action'
    });
  }
});

export default router;
