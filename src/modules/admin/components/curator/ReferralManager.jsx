import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminDelete } from '../../utils/adminApi';
import { EmptyState } from '../shared';

const SectionCard = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  padding: clamp(${theme.spacing.sm}, 0.5vw, ${theme.spacing.lg});
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.04);
`;

const ReferralFormGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(160px, 1fr) minmax(140px, max-content) max-content;
  gap: ${theme.spacing.xs};
  align-items: end;

  .actions {
    display: flex;
    justify-content: flex-end;
    max-width: 100%;
    overflow: hidden;
    justify-self: end;
  }
  .actions > button { max-width: 100%; }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr 1fr;
    .actions { grid-column: 1 / -1; }
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;

const LabelText = styled.label`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${theme.spacing.xs};
`;

const ToggleRow = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  cursor: pointer;
  user-select: none;
  color: rgba(0, 0, 0, 0.8);
`;

const ToggleCheckbox = styled.input.attrs({ type: 'checkbox' })`
  width: 16px;
  height: 16px;
  cursor: pointer;
`;

const ReferralList = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 10px;
  background: ${theme.colors.fpwhite};
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const ReferralHeaderRow = styled.div`
  display: grid;
  grid-template-columns: 1.1fr 1.6fr 1.2fr 1.2fr 0.8fr minmax(80px, max-content);
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: rgba(0, 0, 0, 0.04);
  position: sticky;
  top: 0;
  z-index: 1;

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const ReferralRows = styled.div`
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const ReferralRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.6fr 1.2fr 1.2fr 0.8fr minmax(80px, max-content);
  gap: ${theme.spacing.sm};
  align-items: left;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);

  &:nth-child(even) {
    background: rgba(0, 0, 0, 0.03);
  }

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.sm};
    align-items: flex-start;
    padding: ${theme.spacing.md};
    border-radius: 8px;
    margin-bottom: ${theme.spacing.sm};
    border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  }
`;

const ReferralCell = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: ${theme.breakpoints.tablet}) {
    white-space: normal;
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing.xxs};

    &[data-label]::before {
      content: attr(data-label);
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: ${theme.fontSizes.tiny};
      opacity: 0.7;
      margin-bottom: 2px;
    }
  }
`;

const ReferralActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${theme.spacing.xs};

  @media (max-width: ${theme.breakpoints.tablet}) {
    justify-content: stretch;
    margin-top: ${theme.spacing.xs};

    button {
      flex: 1;
      min-height: 44px;
    }
  }
`;

const CodeBadge = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border: ${theme.borders.dashed} ${theme.colors.black};
  padding: 5px 5px;
  display: inline-flex;
  max-height: 50%;
  align-items: center;
  gap: ${theme.spacing.s};
  cursor: pointer;
  user-select: all;
`;

const StatusChip = styled.span.withConfig({ shouldForwardProp: (p) => p !== '$status' })`
  display: inline-block;
  padding: 5px 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border: ${theme.borders.dashed} ${props => props.$status === 'used' ? theme.colors.olive : theme.colors.success};
  color: ${props => props.$status === 'used' ? theme.colors.black : theme.colors.success};
  background: ${props => props.$status === 'used' ? 'rgba(31, 189, 86, 0.38)' : 'rgba(76, 175, 80, 0.08)'};
`;

const TesterChip = styled.span`
  display: inline-block;
  padding: 5px 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border: ${theme.borders.dashed} rgba(37, 99, 235, 0.5);
  color: #1d4ed8;
  background: rgba(37, 99, 235, 0.15);
`;

const StatusCellWrapper = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  align-items: center;
  flex-wrap: wrap;
`;

const GhostButton = styled(Button)`
  background: transparent;
  border-color: rgba(0, 0, 0, 0.25);
  color: ${theme.colors.black};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-size: ${theme.fontSizes.tiny};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.06);
    border-color: ${theme.colors.black};
  }
`;

const ReferralManager = ({ onStatusChange }) => {
  const [referralForm, setReferralForm] = useState({ email: '', curator_name: '', tester: false });
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadReferrals = async () => {
    try {
      const data = await adminGet('/api/v1/admin/referrals?limit=20');
      setReferrals(data.data || []);
    } catch (error) {
      onStatusChange?.('error', `Failed to load referrals: ${error.message}`);
    }
  };

  useEffect(() => {
    loadReferrals();
  }, []);

  const handleIssueReferral = async () => {
    if (!referralForm.email?.trim()) {
      onStatusChange?.('error', 'Email is required');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        email: referralForm.email.trim(),
        tester: Boolean(referralForm.tester)
      };
      if (referralForm.curator_name?.trim()) payload.curator_name = referralForm.curator_name.trim();
      const result = await adminPost('/api/v1/admin/referrals/issue', payload);
      onStatusChange?.('success', `Referral issued: ${result.data.code}`);
      setReferralForm((prev) => ({ email: '', curator_name: '', tester: prev.tester }));
      await loadReferrals();
    } catch (error) {
      onStatusChange?.('error', `Failed to issue referral: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReferral = async (code) => {
    if (!confirm(`Delete referral ${code}?`)) return;
    try {
      await adminDelete(`/api/v1/admin/referrals/${code}`);
      await loadReferrals();
      onStatusChange?.('success', 'Referral deleted');
    } catch (error) {
      onStatusChange?.('error', `Failed to delete referral: ${error.message}`);
    }
  };

  return (
    <SectionCard>
      <ReferralFormGrid>
        <div>
          <LabelText>Email</LabelText>
          <Input
            type="email"
            value={referralForm.email}
            onChange={(e) => setReferralForm(f => ({ ...f, email: e.target.value }))}
            placeholder="invitee@example.com"
          />
        </div>
        <div>
          <LabelText>Name (optional)</LabelText>
          <Input
            value={referralForm.curator_name}
            onChange={(e) => setReferralForm(f => ({ ...f, curator_name: e.target.value }))}
            placeholder="Curator Name"
          />
        </div>
        <div>
          <LabelText>Tester Access</LabelText>
          <ToggleRow>
            <ToggleCheckbox
              checked={referralForm.tester}
              onChange={(e) => setReferralForm(f => ({ ...f, tester: e.target.checked }))}
            />
            <span>Tester account</span>
          </ToggleRow>
        </div>
        <div className="actions">
          <Button variant="primary" onClick={handleIssueReferral} disabled={loading}>
            {loading ? 'Issuing...' : 'Issue'}
          </Button>
        </div>
      </ReferralFormGrid>

      <ReferralList>
        <ReferralRows>
          <ReferralHeaderRow>
            <span>Code</span>
            <span>Email</span>
            <span>Name</span>
            <span>Issued By</span>
            <span>Status</span>
            <span className="sr-only">Actions</span>
          </ReferralHeaderRow>
          {referrals.length === 0 ? (
            <EmptyState message="No referrals yet" />
          ) : (
            referrals.map((r) => {
              const isTesterReferral = r.tester === 1 || (r.code || '').startsWith('TESTER-');
              return (
                <ReferralRow key={r.id}>
                  <CodeBadge
                    title={r.code}
                    onClick={() => navigator.clipboard?.writeText(r.code)}
                  >
                    {r.code}
                  </CodeBadge>
                  <ReferralCell title={r.email}>{r.email}</ReferralCell>
                  <ReferralCell title={r.curator_name || ''}>{r.curator_name || '—'}</ReferralCell>
                  <ReferralCell title={r.issued_by_label || ''}>{r.issued_by_label || '—'}</ReferralCell>
                  <StatusCellWrapper>
                    <StatusChip $status={r.status}>{r.status}</StatusChip>
                    {isTesterReferral && <TesterChip>Tester</TesterChip>}
                  </StatusCellWrapper>
                  <ReferralActions>
                    <GhostButton
                      type="button"
                      onClick={() => handleDeleteReferral(r.code)}
                    >
                      Clear
                    </GhostButton>
                  </ReferralActions>
                </ReferralRow>
              );
            })
          )}
        </ReferralRows>
      </ReferralList>
    </SectionCard>
  );
};

export default ReferralManager;
