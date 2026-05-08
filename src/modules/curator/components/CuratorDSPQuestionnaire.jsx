import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { DashedBox, Button, Input, theme } from '@shared/styles/GlobalStyles';
import PlatformIcon from '@shared/components/PlatformIcon';
import { useAuth } from '@shared/contexts/AuthContext';
import { safeJson } from '@shared/utils/jsonUtils';

const platforms = [
  { key: 'spotify', label: 'Spotify' },
  { key: 'apple', label: 'Apple Music' },
  { key: 'tidal', label: 'TIDAL' }
];

const createEmptyState = () => platforms.reduce((acc, { key }) => {
  acc[key] = { y: false, email: '', use_own: true };
  return acc;
}, {});

const normalizeResponse = (data = {}) => {
  const normalized = createEmptyState();
  for (const { key } of platforms) {
    const entry = data[key] || {};
    normalized[key] = {
      y: !!entry.y,
      email: entry.email || '',
      use_own: entry.use_own === undefined ? true : !!entry.use_own
    };
  }
  return normalized;
};

export default function CuratorDSPQuestionnaire() {
  const { authenticatedFetch } = useAuth();
  const [state, setState] = useState(() => createEmptyState());
  const [initialState, setInitialState] = useState(() => createEmptyState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState('');

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const res = await authenticatedFetch('/api/v1/curator/onboarding/dsp', { method: 'GET' });
        const json = await safeJson(res, { context: 'Load DSP questionnaire' });
        if (!res.ok || !json.success) {
          throw new Error(json.error || json.message || 'Unable to load questionnaire');
        }
        if (!ignore) {
          const normalized = normalizeResponse(json.data);
          setState(normalized);
          setInitialState(normalized);
        }
      } catch (e) {
        if (!ignore) {
          setError(e.message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [authenticatedFetch]);

  const isDirty = useMemo(() => JSON.stringify(state) !== JSON.stringify(initialState), [state, initialState]);

  const onToggle = (platformKey, available) => {
    setState((prev) => {
      const next = { ...prev, [platformKey]: { ...prev[platformKey] } };
      next[platformKey].y = available;
      if (!available) {
        next[platformKey].email = '';
        next[platformKey].use_own = true;
      }
      return next;
    });
    setError('');
  };

  const onEmailChange = (platformKey, value) => {
    setState((prev) => ({
      ...prev,
      [platformKey]: {
        ...prev[platformKey],
        email: value
      }
    }));
  };

  const onUseOwnToggle = (platformKey, useOwn) => {
    setState((prev) => ({
      ...prev,
      [platformKey]: {
        ...prev[platformKey],
        use_own: useOwn
      }
    }));
  };

  const onSubmit = async () => {
    setSaving(true);
    setError('');
    setSavedAt('');
    try {
      const missingEmail = platforms.find(({ key, label }) => state[key].y && !state[key].email.trim());
      if (missingEmail) {
        throw new Error(`Please provide an email for ${missingEmail.label}`);
      }

      const payload = {};
      platforms.forEach(({ key }) => {
        const entry = state[key];
        payload[key] = {
          y: !!entry.y,
          email: entry.email || '',
          use_own: entry.use_own
        };
      });

      const res = await authenticatedFetch('/api/v1/curator/onboarding/dsp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await safeJson(res, { context: 'Save DSP questionnaire' });
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Failed to save questionnaire');
      }
      const normalized = normalizeResponse(json.data);
      setState(normalized);
      setInitialState(normalized);
      setSavedAt(new Date().toISOString());
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashedBox>
        <HeaderRow>
          <h3>DSP Access Questionnaire</h3>
        </HeaderRow>
        <p style={{ fontFamily: theme.fonts.mono, color: theme.colors.gray[500] }}>Loading...</p>
      </DashedBox>
    );
  }

  return (
    <DashedBox>
      <HeaderRow>
        <h3>DSP Access Questionnaire</h3>
        <HeaderCopy>Let us know which DSPs you can access so we can plan exports.</HeaderCopy>
      </HeaderRow>
      {error && (
        <ErrorText>{error}</ErrorText>
      )}
      <Cards>
        {platforms.map(({ key, label }) => {
          const entry = state[key];
          return (
            <Card key={key}>
              <CardHeader>
                <PlatformIcon platform={key} size={20} inline />
                <CardTitle>{label}</CardTitle>
              </CardHeader>
              <ToggleRow>
                <ToggleButton
                  type="button"
                  $active={entry.y}
                  onClick={() => onToggle(key, true)}
                >
                  Yes
                </ToggleButton>
                <ToggleButton
                  type="button"
                  $active={!entry.y}
                  onClick={() => onToggle(key, false)}
                >
                  No
                </ToggleButton>
              </ToggleRow>
              {entry.y && (
                <FieldGroup>
                  <label htmlFor={`${key}-email`}>Account Email</label>
                  <Input
                    id={`${key}-email`}
                    type="email"
                    value={entry.email}
                    placeholder={`${label} login email`}
                    onChange={(event) => onEmailChange(key, event.target.value)}
                  />
                  <CheckboxRow>
                    <input
                      id={`${key}-use-own`}
                      type="checkbox"
                      checked={entry.use_own}
                      onChange={(event) => onUseOwnToggle(key, event.target.checked)}
                    />
                    <label htmlFor={`${key}-use-own`}>
                      I will export with my own {label} account
                    </label>
                  </CheckboxRow>
                </FieldGroup>
              )}
            </Card>
          );
        })}
      </Cards>
      <Footer>
        <div>
          <HelperText>
            Curators never connect to Flowerpil-owned DSP accounts. If you need us to run exports on your behalf,
            uncheck the box above.
          </HelperText>
          {savedAt && (
            <SavedText>Saved {new Date(savedAt).toLocaleString()}</SavedText>
          )}
        </div>
        <Button
          variant="primary"
          disabled={saving || !isDirty}
          onClick={onSubmit}
        >
          {saving ? 'Saving...' : 'Save Questionnaire'}
        </Button>
      </Footer>
    </DashedBox>
  );
}

const HeaderRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  margin-bottom: ${theme.spacing.md};
`;

const HeaderCopy = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  color: ${theme.colors.black};
`;

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: ${theme.spacing.md};
`;

const Card = styled.div`
  border: ${theme.borders.dashed} ${theme.colors.black};
  padding: ${theme.spacing.sm};
  background: rgba(255, 255, 255, 1);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const CardTitle = styled.div`
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ToggleRow = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
`;

const ToggleButton = styled.button.withConfig({ shouldForwardProp: (prop) => !['$active'].includes(prop) })`
  flex: 1;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${theme.colors.black};
  background: ${props => (props.$active ? theme.colors.black : 'transparent')};
  color: ${props => (props.$active ? theme.colors.white : theme.colors.black)};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};'
  cikir

  label {
    font-family: ${theme.fonts.mono};
    font-size: 12px;
    color: black;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
`;

const CheckboxRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  color: black;
  font-size: 12px;
`;

const Footer = styled.div`
  margin-top: ${theme.spacing.lg};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const HelperText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${theme.colors.black};
  max-width: 480px;
`;

const SavedText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${theme.colors.success};
  margin-top: ${theme.spacing.xs};
`;

const ErrorText = styled.div`
  color: ${theme.colors.error};
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  margin-bottom: ${theme.spacing.sm};
`;
