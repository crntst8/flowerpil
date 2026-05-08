import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import { adminGet, adminPut } from '../../utils/adminApi.js';

const DEFAULT_ROLLOUT = {
  phase: 'pilot',
  pilot_curator_ids: [],
  show_in_home_feed: false,
  show_sidebar_nav: false
};

const WritingTab = () => {
  const [rollout, setRollout] = useState(DEFAULT_ROLLOUT);
  const [curators, setCurators] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const load = async () => {
    try {
      setLoading(true);
      const [rolloutRes, curatorRes] = await Promise.all([
        adminGet('/api/v1/admin/site-admin/writing-rollout'),
        adminGet('/api/v1/admin/site-admin/writing-rollout/curators?limit=200')
      ]);

      setRollout({
        ...DEFAULT_ROLLOUT,
        ...(rolloutRes?.data || {})
      });
      setCurators(Array.isArray(curatorRes?.data) ? curatorRes.data : []);
      setStatus({ type: '', message: '' });
    } catch (error) {
      console.error('Failed to load writing rollout settings:', error);
      setStatus({ type: 'error', message: 'Failed to load writing rollout settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredCurators = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return curators;
    return curators.filter((curator) => {
      const haystack = [curator.name, curator.type, curator.profile_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [curators, search]);

  const selectedIds = useMemo(() => {
    const values = Array.isArray(rollout.pilot_curator_ids) ? rollout.pilot_curator_ids : [];
    return new Set(values.map((value) => Number(value)).filter(Number.isFinite));
  }, [rollout.pilot_curator_ids]);

  const toggleCurator = (curatorId) => {
    const id = Number(curatorId);
    if (!Number.isFinite(id)) return;

    setRollout((prev) => {
      const current = Array.isArray(prev.pilot_curator_ids) ? prev.pilot_curator_ids : [];
      const has = current.some((value) => Number(value) === id);

      return {
        ...prev,
        pilot_curator_ids: has
          ? current.filter((value) => Number(value) !== id)
          : [...current, id]
      };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        phase: rollout.phase === 'public' ? 'public' : 'pilot',
        pilot_curator_ids: Array.isArray(rollout.pilot_curator_ids)
          ? rollout.pilot_curator_ids.map((value) => Number(value)).filter(Number.isFinite)
          : [],
        show_in_home_feed: Boolean(rollout.show_in_home_feed),
        show_sidebar_nav: Boolean(rollout.show_sidebar_nav)
      };

      const response = await adminPut('/api/v1/admin/site-admin/writing-rollout', payload);
      setRollout({
        ...DEFAULT_ROLLOUT,
        ...(response?.data || payload)
      });
      setStatus({ type: 'success', message: 'Writing rollout updated' });
    } catch (error) {
      console.error('Failed to save writing rollout settings:', error);
      setStatus({ type: 'error', message: 'Failed to save writing rollout settings' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Wrapper>
      {status.message && (
        <StatusBanner $type={status.type}>{status.message}</StatusBanner>
      )}

      <ControlGrid>
        <ControlCard>
          <Label>Rollout Phase</Label>
          <Select
            value={rollout.phase || 'pilot'}
            onChange={(event) => setRollout((prev) => ({ ...prev, phase: event.target.value }))}
          >
            <option value="pilot">Pilot (allowlist curators only)</option>
            <option value="public">Public (all curators)</option>
          </Select>
          <Hint>
            Pilot gives dashboard access only to selected curators. Public unlocks writing dashboard access for every curator account.
          </Hint>
        </ControlCard>

        <ControlCard>
          <Label>Public Surfaces</Label>
          <ToggleRow>
            <input
              type="checkbox"
              checked={Boolean(rollout.show_in_home_feed)}
              onChange={(event) => setRollout((prev) => ({ ...prev, show_in_home_feed: event.target.checked }))}
            />
            <span>Show writing cards in landing feed</span>
          </ToggleRow>
          <ToggleRow>
            <input
              type="checkbox"
              checked={Boolean(rollout.show_sidebar_nav)}
              onChange={(event) => setRollout((prev) => ({ ...prev, show_sidebar_nav: event.target.checked }))}
            />
            <span>Enable public writing sidebar navigation endpoint</span>
          </ToggleRow>
          <Hint>
            For a clean staged launch, keep both disabled in pilot and turn them on when you move to public phase.
          </Hint>
        </ControlCard>
      </ControlGrid>

      <ControlCard>
        <SectionHeader>
          <Label>Pilot Curator Allowlist</Label>
          <Meta>{selectedIds.size} selected</Meta>
        </SectionHeader>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search curators..."
          disabled={loading}
        />

        {loading ? (
          <EmptyState>Loading curators...</EmptyState>
        ) : filteredCurators.length === 0 ? (
          <EmptyState>No curators found.</EmptyState>
        ) : (
          <CuratorList>
            {filteredCurators.map((curator) => (
              <CuratorRow key={curator.id}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(Number(curator.id))}
                  onChange={() => toggleCurator(curator.id)}
                  disabled={rollout.phase === 'public'}
                />
                <CuratorMeta>
                  <CuratorName>{curator.name}</CuratorName>
                  <CuratorType>{curator.profile_type || curator.type || 'curator'}</CuratorType>
                </CuratorMeta>
              </CuratorRow>
            ))}
          </CuratorList>
        )}

        {rollout.phase === 'public' && (
          <Hint>Allowlist is ignored while phase is set to public.</Hint>
        )}
      </ControlCard>

      <ControlCard>
        <Label>Substack Migration Controls Enabled For Writers</Label>
        <Hint>
          Writers now have per-piece canonical URL, SEO title/description, newsletter CTA label + URL, excerpt, homepage featuring toggle, and view analytics.
        </Hint>
      </ControlCard>

      <ButtonRow>
        <Button type="button" onClick={handleSave} disabled={saving || loading}>
          {saving ? 'Saving...' : 'Save Writing Rollout'}
        </Button>
      </ButtonRow>
    </Wrapper>
  );
};

export default WritingTab;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const ControlGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
`;

const ControlCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.18);
  padding: ${theme.spacing.md};
  background: rgba(255, 255, 255, 0.72);
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
`;

const Label = styled.label`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h5};
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.4px;
`;

const Meta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const Select = styled.select`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.25);
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  background: #ffffff;
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
`;

const Hint = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.65);
  line-height: 1.45;
`;

const CuratorList = styled.div`
  max-height: 280px;
  overflow-y: auto;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
`;

const CuratorRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);

  &:last-child {
    border-bottom: none;
  }
`;

const CuratorMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CuratorName = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.black};
`;

const CuratorType = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  text-transform: uppercase;
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.md};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const StatusBanner = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$type'
})`
  border: ${theme.borders.solidThin} ${({ $type }) => ($type === 'error' ? '#dc2626' : '#16a34a')};
  color: ${({ $type }) => ($type === 'error' ? '#7f1d1d' : '#14532d')};
  background: ${({ $type }) => ($type === 'error' ? 'rgba(220, 38, 38, 0.08)' : 'rgba(22, 163, 74, 0.08)')};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  padding: ${theme.spacing.sm};
`;
