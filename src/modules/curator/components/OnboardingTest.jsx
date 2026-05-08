import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Container, DashedBox, Button, Input, theme } from '@shared/styles/GlobalStyles';
import { DEFAULT_CURATOR_TYPE, getCuratorTypeOptions } from '@shared/constants/curatorTypes';

const Note = styled.p`
  color: ${theme.colors.gray[600]};
  font-family: ${theme.fonts.mono};
  margin-bottom: ${theme.spacing.lg};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.md};
  @media (max-width: ${theme.breakpoints.tablet}) { grid-template-columns: 1fr; }
`;

export default function OnboardingTest() {
  const [email, setEmail] = useState('tester@example.com');
  const [password, setPassword] = useState('TestPass123!');
  const [curatorName, setCuratorName] = useState('Dev Curator');
  const baseTypeOptions = useMemo(() => getCuratorTypeOptions(), []);
  const [curatorType, setCuratorType] = useState(DEFAULT_CURATOR_TYPE);
  const [typeOptions, setTypeOptions] = useState(baseTypeOptions);
  const [referralCode, setReferralCode] = useState('');
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);

  const log = (m) => setLogs((l) => [m, ...l].slice(0, 12));

  const issueReferral = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/v1/dev/referrals/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, curator_name: curatorName, curator_type: curatorType })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create referral');
      setReferralCode(data.code);
      log(`Referral issued: ${data.code}`);
    } catch (e) {
      log(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const loadTypes = async () => {
      try {
        const res = await fetch('/api/v1/admin/site-admin/curator-types');
        const data = await res.json();
        if (res.ok && Array.isArray(data.types)) {
          const customTypes = data.types.filter(type => type.custom);
          if (customTypes.length > 0) {
            setTypeOptions(getCuratorTypeOptions(customTypes));
          }
        }
      } catch (e) {
        log(`Type load error: ${e.message}`);
      }
    };
    loadTypes();
  }, []);

  useEffect(() => {
    const selectableValues = typeOptions
      .filter(option => !option.isHeader)
      .map(option => option.value);

    if (!selectableValues.includes(curatorType)) {
      const fallback = selectableValues.includes(DEFAULT_CURATOR_TYPE)
        ? DEFAULT_CURATOR_TYPE
        : selectableValues[0];
      if (fallback && fallback !== curatorType) {
        setCuratorType(fallback);
      }
    }
  }, [typeOptions, curatorType]);

  const signup = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/v1/auth/curator/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ referralCode, email, password, curatorProfile: { curatorName, curatorType } })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Signup failed');
      log(`Signup OK: user=${data.user?.email}, curator_id=${data.user?.curator_id}`);
      window.location.href = '/curator-admin/login';
    } catch (e) {
      log(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container>
      <h1>Onboarding Test (Dev)</h1>
      <Note>Dev-only helper: issues a referral and signs up a curator account using the live endpoint.</Note>
      <DashedBox>
        <Row>
          <div>
            <label>Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label>Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </Row>
        <Row>
          <div>
            <label>Curator Name</label>
            <Input value={curatorName} onChange={(e) => setCuratorName(e.target.value)} />
          </div>
          <div>
            <label>Curator Type</label>
            <select
              value={curatorType}
              onChange={(e) => setCuratorType(e.target.value)}
              style={{
                width: '100%',
                background: theme.colors.black,
                border: `${theme.borders.dashed} ${theme.colors.gray[300]}`,
                color: theme.colors.white,
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              }}
            >
              {typeOptions.map((option) => (
                option.isHeader ? (
                  <option
                    key={`header-${option.value}`}
                    value={option.value}
                    disabled
                    className="category-header"
                  >
                    {option.label}
                  </option>
                ) : (
                  <option key={option.value} value={option.value}>{option.label}</option>
                )
              ))}
            </select>
          </div>
        </Row>
        <div style={{ marginBottom: theme.spacing.md }}>
          <label>Referral Code</label>
          <Input value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="Click 'Issue Referral' or paste existing" />
        </div>
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          <Button onClick={issueReferral} disabled={busy}>Issue Referral</Button>
          <Button variant="primary" onClick={signup} disabled={busy || !referralCode}>Sign Up</Button>
        </div>
      </DashedBox>
      <DashedBox>
        <h3 style={{ marginBottom: theme.spacing.sm }}>Logs</h3>
        <ul style={{ fontFamily: theme.fonts.mono, fontSize: theme.fontSizes.small }}>
          {logs.map((m, i) => (<li key={i}>{m}</li>))}
        </ul>
      </DashedBox>
    </Container>
  );
}
