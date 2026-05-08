# User Reports (Feedback)

Authenticated curators can report issues or send feedback directly from the application. Reports are stored in the database and manageable via the admin dashboard.

## Feature Overview

- **Widget**: A "Help / Report Issue" floating button available to all authenticated curators.
- **Backend**: 
  - `POST /api/v1/user-feedback` to submit reports.
  - `user_feedback` table stores the reports.
- **Admin**:
  - View list of reports in Admin > Overview > User Feedback.
  - Resolve reports.
  - Reply via email (opens a modal to send email to the curator).

## Architecture

- **Frontend**: `src/modules/feedback/UserFeedbackWidget.jsx`
- **Admin UI**: `src/modules/admin/components/UserFeedbackPanel.jsx`
- **API**: `server/api/user-feedback.js`
- **Service**: `server/services/userFeedbackService.js`
- **Database**: `user_feedback` table (Migration 094)

## Usage

1. **Curator**: Clicks "Help" button, types message, submits.
2. **Admin**: Goes to Admin Panel, clicks "User Feedback" tab.
3. **Reply**: Admin clicks "Reply via Email", enters subject/body, sends. This uses the system's email service (`sendAdminEmail`).
