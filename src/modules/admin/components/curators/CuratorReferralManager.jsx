import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminDelete } from '../../utils/adminApi';

const Card = styled.div`
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.15);
  padding: ${theme.spacing.lg};
  background: ${theme.colors.fpwhite};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;

  h3 {
    margin: 0;
    font-size: ${theme.fontSizes.medium};
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
`;
const GhostButton = styled(Button)`
  background: transparent;
  border-color: rgba(0, 0, 0, 0.28);
  color: ${theme.colors.black};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
    border-color: ${theme.colors.black};
  }
`;


const SmallRefreshButton = styled(Button)`
  background: ${theme.colors.primary};
  border-color: rgba(0, 0, 0, 0.28);
  color: ${theme.colors.black};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
    border-color: ${theme.colors.black};
  }
`;


const StatusNote = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${theme.spacing.sm};
`;

const Label = styled.span`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.6);
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

const ReferralTable = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 3px;
  overflow: hidden;
`;

const TableHeader = styled.div`
  display: grid;
grid-template-columns: 150px 1fr 1fr 1fr 0.3fr  ;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const TableRow = styled.div`
  display: grid;
grid-template-columns: 150px 1fr 1fr 1fr 0.3fr  ;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-top: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
  align-items: center;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.xs};
  }
`;
const Actions = styled.div`
  display: flex;
  justify-content: right;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  width: 100%;
`;

const CodeBadge = styled.button`
  background: rgba(144, 155, 148, 0.15);
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const StatusChip = styled.span`
  display: inline-block;
  padding: 0 ${theme.spacing.xs};
  border-radius: 2px;
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: ${({ $status }) => {
    switch ($status) {
      case 'used': return 'rgba(34, 197, 94, 0.15)';
      case 'expired': return 'rgba(220, 38, 38, 0.15)';
      case 'tester': return 'rgba(37, 99, 235, 0.15)';
      default: return 'rgba(0, 0, 0, 0.05)';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'used': return '#16a34a';
      case 'expired': return '#dc2626';
      case 'tester': return '#1d4ed8';
      default: return theme.colors.black;
    }
  }};
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.md};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

const CuratorReferralManager = () => {
  const [form, setForm] = useState({ email: '', curator_name: '', tester: false });
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [fetching, setFetching] = useState(true);

  const loadReferrals = async () => {
    setFetching(true);
    try {
      const response = await adminGet('/api/v1/admin/referrals');
      setReferrals(response.data || []);
    } catch (error) {
      setStatus({ type: 'error', message: error?.message || 'Failed to load referrals' });
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadReferrals();
  }, []);

  const handleIssue = async () => {
    if (!form.email.trim()) {
      setStatus({ type: 'error', message: 'Email is required' });
      return;
    }
    setLoading(true);
    setStatus({ type: '', message: '' });
    try {
      await adminPost('/api/v1/admin/referrals/issue', {
        email: form.email.trim(),
        curator_name: form.curator_name.trim() || undefined,
        tester: Boolean(form.tester)
      });
      setForm((prev) => ({ email: '', curator_name: '', tester: prev.tester }));
      await loadReferrals();
      setStatus({ type: 'success', message: 'Referral issued' });
    } catch (error) {
      setStatus({ type: 'error', message: error?.message || 'Failed to issue referral' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (code) => {
    const confirmed = window.confirm(`Delete referral ${code}?`);
    if (!confirmed) return;
    try {
      await adminDelete(`/api/v1/admin/referrals/${code}`);
      await loadReferrals();
      setStatus({ type: 'success', message: 'Referral deleted' });
    } catch (error) {
      setStatus({ type: 'error', message: error?.message || 'Failed to delete referral' });
    }
  };

  return (
    <Card>
      <Header>
        <div>
          <h3>Referral Manager</h3>
          <StatusNote>
            Issue curator referral codes and manage outstanding invites.
          </StatusNote>
        </div>
        <SmallRefreshButton variant="secondary" size="small" onClick={loadReferrals} disabled={fetching}>
          {fetching ? 'Refreshing…' : 'Refresh'}
        </SmallRefreshButton>
      </Header>

      {status.message && (
        <StatusNote style={{ color: status.type === 'error' ? theme.colors.danger : theme.colors.success }}>
          {status.message}
        </StatusNote>
      )}

      <FormRow>
        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(event) => setForm(prev => ({ ...prev, email: event.target.value }))}
            placeholder="invitee@example.com"
          />
        </div>
        <div>
          <Label>Curator Name</Label>
          <Input
            value={form.curator_name}
            onChange={(event) => setForm(prev => ({ ...prev, curator_name: event.target.value }))}
            placeholder="Optional label"
          />
        </div>
        <div>
          <Label>Tester Access</Label>
          <ToggleRow>
            <ToggleCheckbox
              checked={form.tester}
              onChange={(event) => setForm(prev => ({ ...prev, tester: event.target.checked }))}
            />
            <span>Issue code with tester privileges</span>
          </ToggleRow>
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <Button variant="primary" onClick={handleIssue} disabled={loading}>
            {loading ? 'Issuing…' : 'Issue Referral'}
          </Button>
        </div>
      </FormRow>

      <ReferralTable>
        <TableHeader>
          <span>Code</span>
          <span>Email</span>
          <span>Issued By</span>
          <span>Status</span>
        </TableHeader>
        {fetching ? (
          <EmptyState>Loading referrals…</EmptyState>
        ) : referrals.length === 0 ? (
          <EmptyState>No referrals yet.</EmptyState>
        ) : (
          referrals.map((referral) => {
            const isTesterReferral = referral.tester === 1 || (referral.code || '').startsWith('TESTER-');
            return (
              <TableRow key={referral.id}>
                <CodeBadge
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(referral.code)}
                >
                  {referral.code}
                </CodeBadge>
                <span>{referral.email}</span>
                <span>{referral.issued_by_label || '—'}</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.xs }}>
                  <StatusChip $status={referral.status}>{referral.status}</StatusChip>
                  {isTesterReferral && <StatusChip $status="tester">Tester</StatusChip>}
                </div>

                <Actions>
                  <GhostButton
                    size="tiny"
                    onClick={() => handleDelete(referral.code)}
                  >
                    Clear
                  </GhostButton>
                </Actions>
              </TableRow>
            );
          })
        )}
      </ReferralTable>
    </Card>
  );
};

export default CuratorReferralManager;
