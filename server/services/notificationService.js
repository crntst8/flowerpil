/**
 * Notification Service - Email Scaffolding
 *
 * This service contains stub functions for future email notification implementation.
 * Currently, these functions only log to console. When email infrastructure is ready,
 * replace the console.log statements with actual email sending logic.
 */

/**
 * Send export completed notification to curator
 * @param {number} exportRequestId - The ID of the completed export request
 * @returns {Promise<{sent: boolean, scaffolding: boolean}>}
 */
export async function sendExportCompleted(exportRequestId) {
  // TODO: Implement email sending
  // Template: "Your playlist has been exported to {platforms}"
  //
  // Example implementation:
  // 1. Get export request from database
  // 2. Get curator email from curator record
  // 3. Parse destinations to get platform names
  // 4. Send email with success message and links

  console.log(`[NOTIFICATION] Export completed for request ${exportRequestId}`);
  console.log('[NOTIFICATION] Email scaffolding - not yet implemented');

  return {
    sent: false,
    scaffolding: true,
    message: 'Email notification scaffolding in place'
  };
}

/**
 * Send export failed notification to curator
 * @param {number} exportRequestId - The ID of the failed export request
 * @returns {Promise<{sent: boolean, scaffolding: boolean}>}
 */
export async function sendExportFailed(exportRequestId) {
  // TODO: Implement email sending
  // Template: "Export failed. View details in dashboard"
  //
  // Example implementation:
  // 1. Get export request from database
  // 2. Get curator email from curator record
  // 3. Get admin_note and failed_tracks
  // 4. Send email with failure details and link to dashboard

  console.log(`[NOTIFICATION] Export failed for request ${exportRequestId}`);
  console.log('[NOTIFICATION] Email scaffolding - not yet implemented');

  return {
    sent: false,
    scaffolding: true,
    message: 'Email notification scaffolding in place'
  };
}

/**
 * Send generic notification to curator
 * @param {number} curatorId - The curator ID
 * @param {string} subject - Email subject
 * @param {string} message - Email message
 * @returns {Promise<{sent: boolean, scaffolding: boolean}>}
 */
export async function sendCuratorNotification(curatorId, subject, message) {
  // TODO: Implement email sending

  console.log(`[NOTIFICATION] Curator notification: ${subject}`);
  console.log(`[NOTIFICATION] Curator ID: ${curatorId}`);
  console.log(`[NOTIFICATION] Message: ${message}`);
  console.log('[NOTIFICATION] Email scaffolding - not yet implemented');

  return {
    sent: false,
    scaffolding: true,
    message: 'Email notification scaffolding in place'
  };
}

/**
 * Email template structures (for future implementation)
 */
export const EMAIL_TEMPLATES = {
  EXPORT_COMPLETED: {
    subject: 'Your Flowerpil playlist has been exported',
    template: `
      Hi {{curator_name}},

      Good news! Your playlist "{{playlist_title}}" has been successfully exported to:
      {{platforms_list}}

      You can view your exported playlists in your curator dashboard.

      Best,
      The Flowerpil Team
    `
  },

  EXPORT_FAILED: {
    subject: 'Playlist export issue - action needed',
    template: `
      Hi {{curator_name}},

      We encountered an issue while exporting your playlist "{{playlist_title}}".

      {{admin_note}}

      {{#if failed_tracks}}
      The following tracks could not be exported:
      {{#each failed_tracks}}
        - {{title}} by {{artist}} ({{reason}})
      {{/each}}
      {{/if}}

      Please check your curator dashboard for more details.

      Best,
      The Flowerpil Team
    `
  }
};
