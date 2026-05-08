import { useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { Button } from '@shared/styles/GlobalStyles';
import { adminPost } from '../utils/adminApi';

const TestContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const HelperText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  margin: 0;
`;

const StatusMessage = styled.div`
  padding: ${theme.spacing.sm};
  border-radius: 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  background: ${props => 
    props.$type === 'success' ? 'rgba(0, 200, 0, 0.1)' :
    props.$type === 'error' ? 'rgba(255, 0, 0, 0.1)' :
    'rgba(0, 0, 0, 0.05)'
  };
  color: ${props => 
    props.$type === 'success' ? 'rgb(0, 150, 0)' :
    props.$type === 'error' ? 'rgb(200, 0, 0)' :
    'rgba(0, 0, 0, 0.7)'
  };
  border: 1px solid ${props => 
    props.$type === 'success' ? 'rgba(0, 200, 0, 0.3)' :
    props.$type === 'error' ? 'rgba(255, 0, 0, 0.3)' :
    'rgba(0, 0, 0, 0.1)'
  };
`;

const TestActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SLACK_NOTIFICATION_LABELS = {
  error_report: 'Error Report (ERROR_REPORTING Bot)',
  spotify_access_request: 'Spotify Access Request (SPOTIFY Bot)',
  apple_export_success: 'Apple Export Success (APPLE_EXPORT Bot)',
  apple_resolution_failed: 'Apple Resolution Failed (APPLE_EXPORT Bot)',
  system_alert: 'System Alert (SYSTEM_ALERTS Bot)'
};

const SlackNotificationTester = () => {
  const [testSlackStatus, setTestSlackStatus] = useState({ type: '', message: '', detail: '' });
  const [testSlackBusy, setTestSlackBusy] = useState('');

  const triggerTestSlackNotification = async (notificationType) => {
    const label = SLACK_NOTIFICATION_LABELS[notificationType] || 'Test notification';

    setTestSlackBusy(notificationType);
    setTestSlackStatus({ type: '', message: '', detail: '' });

    try {
      const response = await adminPost('/api/v1/admin/site-admin/test-slack-notification', {
        notificationType
      });

      const detailParts = [];
      if (response.result) {
        if (response.result.channel) {
          detailParts.push(`channel: ${response.result.channel}`);
        }
        if (response.result.ts) {
          detailParts.push(`timestamp: ${response.result.ts}`);
        }
      }

      setTestSlackStatus({
        type: 'success',
        message: `${label} notification sent successfully`,
        detail: detailParts.length > 0 ? detailParts.join(' | ') : 'Check Slack channel for message'
      });
    } catch (error) {
      const fallbackMessage = 'Failed to send test Slack notification';
      let detailMessage = error?.details?.error || error?.details?.message || error?.message || '';
      
      // Include troubleshooting steps if provided
      if (error?.details?.troubleshooting) {
        const steps = error.details.troubleshooting.steps || [];
        detailMessage += steps.length > 0 ? `\n\n${error.details.troubleshooting.hint || 'Setup steps:'}\n${steps.join('\n')}` : '';
      }
      
      setTestSlackStatus({
        type: 'error',
        message: error?.message || fallbackMessage,
        detail: detailMessage
      });
    } finally {
      setTestSlackBusy('');
    }
  };

  return (
    <TestContainer>
      <HelperText>
        Test individual Slack notification types to verify bot configuration and message formatting.
      </HelperText>
      {testSlackStatus.message ? (
        <>
          <StatusMessage $type={testSlackStatus.type} role="status">
            {testSlackStatus.message}
          </StatusMessage>
          {testSlackStatus.detail ? (
            <HelperText>{testSlackStatus.detail}</HelperText>
          ) : null}
        </>
      ) : null}
      <TestActions>
        <Button
          size="small"
          variant="secondary"
          onClick={() => triggerTestSlackNotification('error_report')}
          disabled={Boolean(testSlackBusy)}
        >
          {testSlackBusy === 'error_report' ? 'Sending...' : 'Error Report'}
        </Button>
        <Button
          size="small"
          variant="secondary"
          onClick={() => triggerTestSlackNotification('spotify_access_request')}
          disabled={Boolean(testSlackBusy)}
        >
          {testSlackBusy === 'spotify_access_request' ? 'Sending...' : 'Spotify Access Request'}
        </Button>
        <Button
          size="small"
          variant="secondary"
          onClick={() => triggerTestSlackNotification('apple_export_success')}
          disabled={Boolean(testSlackBusy)}
        >
          {testSlackBusy === 'apple_export_success' ? 'Sending...' : 'Apple Export Success'}
        </Button>
        <Button
          size="small"
          variant="secondary"
          onClick={() => triggerTestSlackNotification('apple_resolution_failed')}
          disabled={Boolean(testSlackBusy)}
        >
          {testSlackBusy === 'apple_resolution_failed' ? 'Sending...' : 'Apple Resolution Failed'}
        </Button>
        <Button
          size="small"
          variant="secondary"
          onClick={() => triggerTestSlackNotification('system_alert')}
          disabled={Boolean(testSlackBusy)}
        >
          {testSlackBusy === 'system_alert' ? 'Sending...' : 'System Alert'}
        </Button>
      </TestActions>
    </TestContainer>
  );
};

export default SlackNotificationTester;

