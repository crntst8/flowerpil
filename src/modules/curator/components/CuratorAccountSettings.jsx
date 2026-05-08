import { useState } from 'react';
import styled from 'styled-components';
import {
  Button,
  FormField,
  Input,
  PageHeader,
  SectionCard,
  SectionHeader,
  SectionTitle,
  StatusBanner,
  TwoColumnGrid,
  ContentWrapper,
  Stack,
  tokens,
  theme,
} from './ui/index.jsx';
import { useAuth } from '@shared/contexts/AuthContext';
import { safeJson } from '@shared/utils/jsonUtils';
import CuratorModalShell from './ui/CuratorModalShell.jsx';
export default function CuratorAccountSettings() {
  const { user, logout, requestPasswordReset, authenticatedFetch } = useAuth();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Email change state
  const [currentPasswordEmail, setCurrentPasswordEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  // Email reset link state
  const [resetStatus, setResetStatus] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordStatus('');
    setPasswordError('');

    if (!currentPassword || !newPassword) {
      setPasswordError('Please fill in all fields');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }

    setPasswordLoading(true);

    try {
      const res = await authenticatedFetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await safeJson(res, { context: 'Change password' });

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to change password');
      }

      setPasswordStatus('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
    } catch (e) {
      setPasswordError(e.message || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleResetLinkRequest = async (event) => {
    event.preventDefault();
    setResetStatus('');
    setResetError('');

    const targetEmail = (user?.username || user?.email || '').trim();
    if (!targetEmail) {
      setResetError('We could not determine the email linked to your account.');
      return;
    }

    setResetLoading(true);
    try {
      const result = await requestPasswordReset(targetEmail);
      if (result.success) {
        setResetStatus(result.message || `Reset link sent to ${targetEmail}`);
      } else {
        setResetError(result.error || 'Failed to send reset email');
      }
    } catch (err) {
      setResetError(err?.message || 'Failed to send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  const handleEmailChange = async (e) => {
    e.preventDefault();
    setEmailStatus('');
    setEmailError('');

    if (!currentPasswordEmail || !newEmail) {
      setEmailError('Please fill in all fields');
      return;
    }

    if (!newEmail.includes('@')) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setEmailLoading(true);

    try {
      const res = await authenticatedFetch('/api/v1/auth/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPasswordEmail, newEmail })
      });

      const data = await safeJson(res, { context: 'Change email' });

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to change email');
      }

      setEmailStatus('Email updated successfully. Please log in with your new email.');
      setCurrentPasswordEmail('');
      setNewEmail('');

      // Log out user after email change so they can log in with new email
      setTimeout(async () => {
        await logout();
        window.location.href = '/curator-admin/login';
      }, 2000);
    } catch (e) {
      setEmailError(e.message || 'Failed to change email');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/home';
    } catch (e) {
      console.error('Logout error:', e);
      window.location.href = '/home';
    }
  };

  // Determine which status to show
  const hasError = passwordError || emailError || resetError;
  const statusVariant = hasError ? 'error' : 'success';
  const statusMessages = [
    passwordError,
    passwordStatus,
    emailError,
    emailStatus,
    resetError,
    resetStatus,
  ].filter(Boolean);

  return (
    <ContentWrapper>
      <PageHeader>
        <h1>Account Settings</h1>
        {(user?.username || user?.email) && (
          <p>Logged in as: <strong>{user?.username || user?.email}</strong></p>
        )}
      </PageHeader>

      {statusMessages.length > 0 && (
        <StatusBanner $variant={statusVariant}>
          {statusMessages.map((msg, i) => (
            <p key={i}>{msg}</p>
          ))}
        </StatusBanner>
      )}

      <TwoColumnGrid>
        {/* Left Column: Password Management */}
        <Stack $gap={tokens.spacing[4]}>
          {/* Change Password */}
          <SectionCard>
            <SectionHeader>
              <div>
                <SectionTitle>Change Password</SectionTitle>
              </div>
            </SectionHeader>

            <form onSubmit={handlePasswordChange}>
              <Stack $gap={tokens.spacing[4]}>
                <FormField label="Current Password">
                  <Input
                    id="current-password"
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={passwordLoading}
                    autoComplete="current-password"
                  />
                </FormField>

                <FormField label="New Password">
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Enter new password (min 8 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={passwordLoading}
                    autoComplete="new-password"
                  />
                </FormField>

                <Button
                  type="submit"
                  $variant="primary"
                  disabled={!currentPassword || !newPassword || passwordLoading}
                >
                  {passwordLoading ? 'Updating...' : 'Update Password'}
                </Button>
              </Stack>
            </form>
          </SectionCard>

          {/* Password reset email */}
          <SectionCard as="form" onSubmit={handleResetLinkRequest}>
            <SectionHeader>
              <div>
                <SectionTitle>Password Reset Link</SectionTitle>
              </div>
            </SectionHeader>
            
            <Stack $gap={tokens.spacing[4]}>
              <Button
                type="submit"
                $variant="secondary"
                disabled={resetLoading}
              >
                {resetLoading ? 'Sending...' : 'Email reset link'}
              </Button>
            </Stack>
          </SectionCard>
        </Stack>

        {/* Right Column: Email & Session Management */}
        <Stack $gap={tokens.spacing[4]}>
          {/* Change Email */}
          <SectionCard>
            <SectionHeader>
              <div>
                <SectionTitle>Change Email</SectionTitle>
              </div>
            </SectionHeader>

            <form onSubmit={handleEmailChange}>
              <Stack $gap={tokens.spacing[4]}>
                <FormField label="Current Password">
                  <Input
                    id="current-password-email"
                    type="password"
                    placeholder="Enter current password"
                    value={currentPasswordEmail}
                    onChange={(e) => setCurrentPasswordEmail(e.target.value)}
                    disabled={emailLoading}
                    autoComplete="current-password"
                  />
                </FormField>

                <FormField label="New Email">
                  <Input
                    id="new-email"
                    type="email"
                    placeholder="Enter new email address"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={emailLoading}
                    autoComplete="email"
                  />
                </FormField>

                <Button
                  type="submit"
                  $variant="primary"
                  disabled={!currentPasswordEmail || !newEmail || emailLoading}
                >
                  {emailLoading ? 'Updating...' : 'Update Email'}
                </Button>
              </Stack>
            </form>
          </SectionCard>

          {/* Logout */}
          <SectionCard>
            <SectionHeader>
              <div>
                <SectionTitle>Session Management</SectionTitle>
              </div>
            </SectionHeader>
            
            <Button onClick={() => setConfirmLogoutOpen(true)} $variant="danger">
              Log Out
            </Button>
          </SectionCard>
        </Stack>
      </TwoColumnGrid>

      <CuratorModalShell
        isOpen={confirmLogoutOpen}
        onClose={() => setConfirmLogoutOpen(false)}
        title="Log out"
        size="sm"
        footer={(
          <>
            <Button $variant="default" onClick={() => setConfirmLogoutOpen(false)}>
              Stay signed in
            </Button>
            <Button
              $variant="danger"
              onClick={async () => {
                setConfirmLogoutOpen(false);
                await handleLogout();
              }}
            >
              Log out
            </Button>
          </>
        )}
      >
        <p style={{ margin: 0, fontFamily: theme.fonts.primary, lineHeight: 1.5 }}>
          End your current curator dashboard session on this device?
        </p>
      </CuratorModalShell>
    </ContentWrapper>
  );
}
