import styled from 'styled-components';
import PropTypes from 'prop-types';
import { theme } from '@shared/styles/GlobalStyles';

const Container = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$paused' && prop !== '$failed' })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const Dot = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$paused' && prop !== '$failed' })`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(p) => {
    if (p.$failed) return '#dc2626';
    if (p.$paused) return '#ffc107';
    return '#10b981';
  }};
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);

  @media (max-width: ${theme.breakpoints.desktop}) {
    width: 8px;
    height: 8px;
  }
`;

const Secondary = styled.span`
  display: none; /* Always hide - dates are shown in dedicated columns */
`;

const formatDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch (error) {
    return date.toISOString().replace('T', ' ').slice(0, 16);
  }
};

export default function ScheduleIndicator({ schedule }) {
  if (!schedule) return null;

  const status = schedule.status || 'active';
  const paused = status === 'paused';
  const failed = status === 'failed';

  const ariaLabel = paused ? 'Schedule Paused' : failed ? 'Schedule Needs Attention' : 'Schedule Active';

  return (
    <Container $paused={paused} $failed={failed}>
      <Dot $paused={paused} $failed={failed} aria-label={ariaLabel} role="status" />
    </Container>
  );
}

ScheduleIndicator.propTypes = {
  schedule: PropTypes.shape({
    status: PropTypes.string,
    next_run_at: PropTypes.string,
    last_run_at: PropTypes.string
  })
};
