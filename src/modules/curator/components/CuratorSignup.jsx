import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { DashedBox, Button, Input, theme } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';
import { useSiteSettings } from '@shared/contexts/SiteSettingsContext';
import ImageUpload from '../../admin/components/ImageUpload.jsx';
import LocationAutocomplete from '@shared/components/LocationAutocomplete.jsx';
// DSP configuration is now deferred to first playlist creation (just-in-time approach)
import {
  DEFAULT_CURATOR_TYPE,
  getCuratorTypeLabel,
  getCuratorTypeOptions
} from '@shared/constants/curatorTypes';

// Full viewport container - no body scroll
const FullViewportContainer = styled.div`

  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.xl} ${theme.spacing.md};
  background: linear-gradient(155deg, ${theme.colors.black} 0%, ${theme.colors.blackAct} 60%, rgba(0, 0, 0, 0.92) 100%);
`;

const WizardCard = styled(DashedBox)`
  width: min(640px, 100%);
  padding: ${theme.spacing.xl};
  background: ${theme.colors.fpwhiteTrans};
  color: ${theme.colors.black};
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
    box-shadow: 0 2px 12px rgba(255, 255, 255, 0.73);

  
  gap: ${theme.spacing.lg};
  max-height: calc(100vh - ${theme.spacing.xl});
  overflow-y: auto;

  @media (max-width: ${theme.breakpoints.tablet}) {
    padding: ${theme.spacing.lg};
    max-height: none;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md};
  }
`;

const LogoSection = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  
  
  img {
    width: 50px;
    height: 50px;
    object-fit: contain;
    display: block;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.73);
        margin-bottom: 1em;


  }
`;

const WizardHeader = styled.header`
  display: grid;
  
  gap: ${theme.spacing.xs};
  text-align: center;
`;

const StepBadge = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.black[600]};
  margin-bottom: 0.5em;

`;

const StepTitle = styled.h1`
  font-size: clamp(1rem, 3vw, 1.9rem);
  color: ${theme.colors.black};
  letter-spacing: -0.9px;
  font-family: ${theme.fonts.primary};
    text-transform: none;


  margin: 0;
  line-height: 1;
`;

const StepDescription = styled.p`
  margin: 0;
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
    font: ${theme.fonts.primary};
    margin-top: 1em;
        margin-bottom: 1em;


  line-height: 0;
`;

const ProgressTrack = styled.div`
  height: 4px;
  background: ${theme.colors.white};
  position: relative;
  overflow: hidden;
  border-radius: 999px;
`;

const ProgressFill = styled.div`
  height: 100%;
  width: ${(p) => `${p.$percent}%`};
  background: ${theme.colors.success};
  transition: width ${theme.transitions.normal};
`;

const StepContent = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  text-align: left;
`;

const FieldStack = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
`;

const InputGroup = styled.div`
  display: grid;
  gap: ${theme.spacing.xs};
  text-align: left;
`;

const InputLabel = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: ${theme.spacing.xs};
  opacity: 0.9;
`;

const LivePreview = styled.div`
  font-family: ${theme.fonts.primary};
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  justify-self: center;
  font-size: ${theme.fontSizes.small};
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
  border: ${theme.borders.solid} ${theme.colors.blackAct};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  width: fit-content;
`;

const CopyText = styled.p`
  margin: 0;
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.black};
  font-weight: bold;
  text-align: center;
  letter-spacing: -0.9px;
    line-height: 0.5;

`;

const InstructionText = styled.p`
  font-family: ${theme.fonts.primary};
  opacity: 0.75;
  margin: ${theme.spacing.xs} 0 0 0;
  font-size: ${theme.fontSizes.tiny};
  line-height: 1.3;
`;

const PasswordRequirements = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  background: ${theme.colors.white};
  border-radius: 8px;
  border: ${theme.borders.solidThin} ${theme.colors.blackAct};
`;

const RequirementItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  color: ${props => props.$met ? theme.colors.success : theme.colors.black};
  transition: all ${theme.transitions.fast};
  cursor: help;

  &:hover {
    transform: translateX(4px);
    color: ${props => props.$met ? theme.colors.success : theme.colors.black};
  }
`;

const RequirementIcon = styled.span`
  font-size: ${theme.fontSizes.small};
  min-width: 20px;
  text-align: center;
`;

const PasswordInputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const PasswordToggleButton = styled.button`
  position: absolute;
  right: ${theme.spacing.sm};
  background: none;
  border: none;
  color: ${theme.colors.black};
  cursor: pointer;
  padding: ${theme.spacing.xs};
  font-size: ${theme.fontSizes.tiny};
  opacity: 0.6;
  transition: opacity ${theme.transitions.fast};

  &:hover {
    opacity: 1;
  }

  &:focus {
    outline: none;
    opacity: 1;
  }
`;

const StatusMessage = styled.div`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 8px;
  background: ${(p) => (p.$type === 'error' ? 'rgba(229, 62, 62, 0.1)' : 'rgba(72, 187, 120, 0.12)')};
  border: ${theme.borders.solidThin} ${(p) => (p.$type === 'error' ? 'rgba(229, 62, 62, 0.4)' : 'rgba(72, 187, 120, 0.4)')};
  color: ${(p) => (p.$type === 'error' ? '#8f2d2d' : '#1b5135')};
  font-size: ${theme.fontSizes.tiny};
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: center;
  flex-wrap: wrap;
`;

const SelectField = styled.select`
  width: 100%;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.blackAct};
  color: ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  appearance: none;

  &:focus {
    border-color: ${theme.colors.black};
    background: ${theme.colors.intext};
    outline: none;
  }
`;

const CompactImageContainer = styled.div`
  img {
    max-width: 200px !important;
    max-height: 200px !important;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    img {
      max-width: 150px !important;
      max-height: 150px !important;
    }
  }
`;

// Step configuration - verification step is dynamically shown when required
// DSP configuration is now deferred to first playlist creation (just-in-time)
// Spotify OAuth is gated - curators import via URL and export via Flowerpil account
const BASE_STEPS = [
  {
    id: 'email',
    title: 'signup to share playlists',
    description: ''
  },
  {
    id: 'verify',
    title: 'verify your email',
    description: 'enter the 6-digit code sent to your email',
    conditional: true // Only shown when verification required
  },
  {
    id: 'password',
    title: 'create password',
    description: ''
  },
  {
    id: 'identity',
    title: 'identity',
    description: 'details for yr profile (we will never display your email)'
  },
  {
    id: 'pilbio',
    title: 'pil.bio',
    description: 'our optional link-in-bio service'
  },
  {
    id: 'image',
    title: 'profile pic',
    description: 'optional - can add later'
  }
];

const getStepConfig = (requiresVerification) => {
  if (requiresVerification) {
    return BASE_STEPS;
  }
  return BASE_STEPS.filter(step => !step.conditional);
};

const AUTO_REFERRAL_KEY = 'fp:linkout:referralContext';
const AUTO_REFERRAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

const buildAutoReferralContext = (playlistId) => {
  const now = Date.now();
  return {
    playlistId,
    createdAt: now,
    expiresAt: now + AUTO_REFERRAL_TTL_MS
  };
};

const safeStoreAutoReferralContext = (context) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTO_REFERRAL_KEY, JSON.stringify(context));
  } catch {
    // ignore storage failures
  }
};

const safeRemoveAutoReferralContext = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTO_REFERRAL_KEY);
  } catch {
    // ignore storage failures
  }
};

const readStoredAutoReferralContext = () => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(AUTO_REFERRAL_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed?.playlistId && parsed?.expiresAt && Date.now() < parsed.expiresAt) {
      return parsed;
    }
  } catch {
    // ignore parse/storage failures
  }
  safeRemoveAutoReferralContext();
  return null;
};

const resolveAutoReferralContext = (search) => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(search || '');
  const referralParam = params.get('ref');
  if (referralParam) {
    safeRemoveAutoReferralContext();
    return null;
  }
  const source = params.get('source');
  const playlistIdParam = params.get('playlistId');
  if (source === 'linkout' && playlistIdParam) {
    const parsedId = Number(playlistIdParam);
    if (Number.isFinite(parsedId)) {
      const context = buildAutoReferralContext(parsedId);
      safeStoreAutoReferralContext(context);
      return context;
    }
  }
  return readStoredAutoReferralContext();
};

export default function CuratorSignup() {
  const { isAuthenticated, user, checkAuthStatus, authenticatedFetch } = useAuth();
  const { isOpenSignupEnabled } = useSiteSettings();
  const routeLocation = useLocation();
  const openSignupMode = isOpenSignupEnabled();

  // Step state
  const [step, setStep] = useState(0); // 0..6 (7 steps total)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  // DSP configuration is now deferred to first playlist creation

  // Collected form state
  const [referralCode, setReferralCode] = useState('');
  const [email, setEmail] = useState('');
  const [autoReferralContext, setAutoReferralContext] = useState(() => (
    resolveAutoReferralContext(routeLocation.search)
  ));
  const [password, setPassword] = useState('');
  const [pwdTouched, setPwdTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [curatorName, setCuratorName] = useState('');
  const [curatorType, setCuratorType] = useState(DEFAULT_CURATOR_TYPE);
  const baseTypeOptions = useMemo(() => getCuratorTypeOptions(), []);
  const [typeOptions, setTypeOptions] = useState(baseTypeOptions);
  const [location, setLocation] = useState('');
  const [locationDetails, setLocationDetails] = useState(null);
  const [desiredHandle, setDesiredHandle] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [instagram, setInstagram] = useState('');
  const [spotifyApiEmail, setSpotifyApiEmail] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [appleUrl, setAppleUrl] = useState('');
  const [tidalUrl, setTidalUrl] = useState('');
  const [bandcampUrl, setBandcampUrl] = useState('');
  // Additional links are managed post-onboarding in dashboard
  const [bioShort, setBioShort] = useState('');
  const [bio, setBio] = useState('');

  // Email verification state (for open signup hardening)
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationExpiresAt, setVerificationExpiresAt] = useState(null);

  // Compute step configuration based on whether verification is required
  const STEP_CONFIG = useMemo(() => getStepConfig(requiresVerification), [requiresVerification]);

  // Step navigation helpers using step IDs instead of hardcoded indices
  const getCurrentStepId = () => STEP_CONFIG[step]?.id || null;
  const getStepIndexById = (id) => STEP_CONFIG.findIndex(s => s.id === id);
  const goToStepById = (id) => {
    const idx = getStepIndexById(id);
    if (idx !== -1) setStep(idx);
  };

  const [accountCreated, setAccountCreated] = useState(false);
  const [createdCuratorId, setCreatedCuratorId] = useState(null);
  const [sessionCsrfToken, setSessionCsrfToken] = useState('');

  const resolveEffectiveCsrfToken = (preferredToken) => preferredToken || sessionCsrfToken || getCsrfToken() || '';

  const normalizeOptionalUrl = (value) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return /^(https?:)?\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };


  // Redirect authenticated users away from signup unless we're mid-onboarding
  useEffect(() => {
    if (isAuthenticated && (user?.role === 'curator' || user?.role === 'admin')) {
      // If account was just created in this flow, allow steps to continue (image upload, etc.)
      if (!accountCreated) {
        window.location.href = '/curator-admin';
      }
    }
  }, [isAuthenticated, user, accountCreated]);

  useEffect(() => {
    const params = new URLSearchParams(routeLocation.search || '');
    const referralParam = params.get('ref');

    if (referralParam) {
      setReferralCode(referralParam.trim());
      setAutoReferralContext(null);
      safeRemoveAutoReferralContext();
      return;
    }

    const nextContext = resolveAutoReferralContext(routeLocation.search);
    setAutoReferralContext(nextContext);
  }, [routeLocation.search]);

  // Load curator type options
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
      } catch (err) {
        console.warn('Failed to load curator types', err);
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

  // Always read latest CSRF cookie at time of request
  const getCsrfToken = () => getCookie('csrf_token');

  // This is now the complete all-in-one signup function

  const validateHandle = async (handle) => {
    const v = await fetch(`/api/v1/bio-handles/validate/${encodeURIComponent(handle)}`);
    const vData = await v.json();
    if (!v.ok || !vData.valid) {
      throw new Error(vData.message || 'Handle is invalid');
    }
    const c = await fetch(`/api/v1/bio-handles/check/${encodeURIComponent(handle)}`);
    const cData = await c.json();
    if (!c.ok || !cData.available) {
      throw new Error(cData.message || 'Handle not available');
    }
    return (cData?.normalized || handle).toLowerCase();
  };

  const validateProfileFields = () => {
    const sanitizedContactEmail = (contactEmail || '').trim();
    if (sanitizedContactEmail && !isValidEmail(sanitizedContactEmail)) {
      throw new Error('Contact email looks invalid. Please double-check.');
    }

    const sanitizedSpotifyApiEmail = (spotifyApiEmail || '').trim();
    if (sanitizedSpotifyApiEmail && !isValidEmail(sanitizedSpotifyApiEmail)) {
      throw new Error('Spotify API email looks invalid. Please use a real email address.');
    }

    return {
      sanitizedContactEmail,
      sanitizedSpotifyApiEmail
    };
  };

  const ensureCuratorAccount = async () => {
    if (accountCreated) {
      const resolvedCuratorId = createdCuratorId || user?.curator_id || null;
      if (!resolvedCuratorId) {
        throw new Error('Curator profile not found for this session. Please refresh and try again.');
      }
      return {
        curatorId: resolvedCuratorId,
        csrfToken: resolveEffectiveCsrfToken()
      };
    }

    setStatus('Creating your curator account...');

    const signupRes = await fetch('/api/v1/auth/curator/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        referralCode,
        email,
        password,
        curatorProfile: { curatorName, curatorType, location }
      })
    });
    const signupData = await signupRes.json();
    if (!signupRes.ok || !signupData.success) {
      throw new Error(signupData.message || signupData.error || 'Account creation failed');
    }
    localStorage.removeItem(AUTO_REFERRAL_KEY);
    setAccountCreated(true);
    const newCuratorId = signupData?.user?.curator_id || null;
    setCreatedCuratorId(newCuratorId);
    const csrfFromResponse = signupData?.csrfToken || '';
    if (csrfFromResponse) setSessionCsrfToken(csrfFromResponse);

    // Refresh auth context so downstream authenticated calls succeed
    await checkAuthStatus();

    return {
      curatorId: newCuratorId,
      csrfToken: csrfFromResponse
    };
  };

  const persistCuratorProfile = async ({
    curatorId,
    csrfTokenHint,
    sanitizedContactEmail,
    sanitizedSpotifyApiEmail
  }) => {
    if (!curatorId) {
      throw new Error('We could not determine which curator profile to update. Please refresh and try again.');
    }

    const csrfToken = resolveEffectiveCsrfToken(csrfTokenHint);
    const csrfHeader = csrfToken ? { 'X-CSRF-Token': csrfToken } : {};

    if (desiredHandle) {
      setStatus('Reserving your Pil.bio link...');
      const normalizedHandle = await validateHandle(desiredHandle);
      const bioRes = await fetch('/api/v1/bio-profiles', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeader
        },
        body: JSON.stringify({
          handle: normalizedHandle,
          curator_id: curatorId,
          display_settings: '{}',
          theme_settings: '{}',
          seo_metadata: '{}',
          draft_content: '{}',
          is_published: 0,
          version_number: 1
        })
      });
      const bioData = await bioRes.json().catch(() => ({}));
      if (!bioRes.ok || !bioData.success) {
        throw new Error(bioData.message || bioData.error || 'Failed to create Pil.bio handle');
      }
    }

    setStatus('Saving your profile details...');

    const socials = [];
    const ig = (instagram || '').replace('@', '').trim();
    if (ig) socials.push({ platform: 'instagram', url: `https://instagram.com/${ig}` });

    const customFieldsPayload = {};
    const trimmedSpotifyApiEmail = sanitizedSpotifyApiEmail || '';
    if (trimmedSpotifyApiEmail) {
      customFieldsPayload.spotify_api_email = trimmedSpotifyApiEmail;
    }
    if (locationDetails && locationDetails.formatted) {
      customFieldsPayload.location_details = {
        formatted: locationDetails.formatted,
        city: locationDetails.city || '',
        country: locationDetails.country || '',
        lat: typeof locationDetails.lat === 'number' ? locationDetails.lat : null,
        lng: typeof locationDetails.lng === 'number' ? locationDetails.lng : null,
        raw: locationDetails.raw || locationDetails.formatted,
        placeId: locationDetails.placeId || ''
      };
    }

    const updateData = {
      name: curatorName,
      profile_type: curatorType,
      location: location?.trim() || null
    };
    if (bioShort.trim()) updateData.bio_short = bioShort.trim();
    if (bio.trim()) updateData.bio = bio.trim();

    const normalizedWebsite = normalizeOptionalUrl(websiteUrl);
    if (normalizedWebsite) updateData.website_url = normalizedWebsite;
    const normalizedContactEmail = sanitizedContactEmail ? sanitizedContactEmail : '';
    if (normalizedContactEmail) updateData.contact_email = normalizedContactEmail;
    const normalizedSpotifyUrl = normalizeOptionalUrl(spotifyUrl);
    if (normalizedSpotifyUrl) updateData.spotify_url = normalizedSpotifyUrl;
    const normalizedAppleUrl = normalizeOptionalUrl(appleUrl);
    if (normalizedAppleUrl) updateData.apple_url = normalizedAppleUrl;
    const normalizedTidalUrl = normalizeOptionalUrl(tidalUrl);
    if (normalizedTidalUrl) updateData.tidal_url = normalizedTidalUrl;
    const normalizedBandcampUrl = normalizeOptionalUrl(bandcampUrl);
    if (normalizedBandcampUrl) updateData.bandcamp_url = normalizedBandcampUrl;
    if (socials.length > 0) updateData.social_links = socials;
    if (Object.keys(customFieldsPayload).length > 0) {
      updateData.custom_fields = customFieldsPayload;
    }

    const updateRes = await fetch('/api/v1/curator/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...csrfHeader
      },
      credentials: 'include',
      body: JSON.stringify(updateData)
    });
    const updateResData = await updateRes.json().catch(() => ({}));
    if (!updateRes.ok || !updateResData.success) {
      throw new Error(updateResData.message || updateResData.error || 'Profile update failed');
    }
    return updateResData;
  };

  // Step 3: Create account + save handle, move to step 4 for image
  // DSP configuration is now deferred to first playlist creation
  const createAccountAndInitialSetup = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');

    try {
      const { sanitizedContactEmail, sanitizedSpotifyApiEmail } = validateProfileFields();
      const { curatorId, csrfToken } = await ensureCuratorAccount();
      await persistCuratorProfile({
        curatorId,
        csrfTokenHint: csrfToken,
        sanitizedContactEmail,
        sanitizedSpotifyApiEmail
      });
      // DSP preferences are now configured during first playlist creation (just-in-time)
      // This reduces cognitive load during signup
      setStatus('Account created! Add a profile image (optional).');
      goToStepById('image');
    } catch (e) {
      console.error('Signup error:', e);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const completeOnboarding = () => {
    try {
      localStorage.setItem('fp:curator:showFirstVisitDSPModal', 'true');
    } catch (err) {
      console.warn('Unable to persist DSP onboarding flag', err);
    }
    // Redirect to curator dashboard
    window.location.href = '/curator-admin';
  };

  const finishOnboarding = async () => {
    if (!accountCreated) {
      // Safety: if somehow not created, fall back to full submit
      return createAccountAndInitialSetup();
    }
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      if (profileImage) {
        setStatus('Saving profile image...');
        const csrfToken = resolveEffectiveCsrfToken();
        const res = await fetch('/api/v1/curator/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
          },
          credentials: 'include',
          body: JSON.stringify({ profile_image: profileImage })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || data.message || 'Failed to save profile image');
        }
      }
      // Complete onboarding - DSP configuration handled in dashboard
      completeOnboarding();
    } catch (e) {
      console.error('Finalize onboarding error:', e);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Validation helpers
  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };
  
  const passwordChecks = (pwd) => ({
    length: pwd.length >= 10,
    upper: /[A-Z]/.test(pwd),
    number: /\d/.test(pwd)
  });
  const isPasswordStrong = (pwd) => {
    const c = passwordChecks(pwd);
    return c.length && c.upper && c.number;
  };
  
  const isValidHandle = (handle) => {
    return /^[a-z0-9-]{3,32}$/.test(handle.toLowerCase());
  };
  
  const canNext = () => {
    const currentStepId = getCurrentStepId();

    if (currentStepId === 'email') {
      // Open signup mode or auto-referral: only require email
      if (openSignupMode || autoReferralContext?.playlistId) {
        return !!email && isValidEmail(email);
      }
      // Normal mode: require referral code and email
      return !!referralCode && !!email && isValidEmail(email);
    }
    if (currentStepId === 'verify') {
      // Require exactly 6 digits
      return verificationCode.length === 6 && /^\d{6}$/.test(verificationCode);
    }
    if (currentStepId === 'password') return !!password && isPasswordStrong(password);
    if (currentStepId === 'identity') return !!curatorName && !!curatorType;
    if (currentStepId === 'pilbio') return !!desiredHandle && isValidHandle(desiredHandle);
    if (currentStepId === 'image') return true; // Profile image (final submission - optional)
    return false;
  };

  const onNext = async () => {
    if (busy) return;
    const currentStepId = getCurrentStepId();

    // Email step: check risk and potentially require verification
    if (currentStepId === 'email') {
      // Open signup mode: call check endpoint to evaluate risk
      if (openSignupMode) {
        try {
          setBusy(true);
          setError('');
          const res = await fetch('/api/v1/auth/curator/open-signup/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || data.error || 'Email check failed');
          }

          if (data.requiresVerification) {
            // Show verification step
            setRequiresVerification(true);
            setVerificationExpiresAt(data.expiresAt || null);
            // After state update, useMemo will recompute STEP_CONFIG with verify step
            // Navigate to verify step (will be index 1 after STEP_CONFIG update)
            setStep(1);
          } else {
            // Trusted traffic - skip verification, go to password
            setEmailVerified(true);
            goToStepById('password');
          }
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
        return;
      }

      // Referral-based signup: validate referral + email on server
      try {
        setBusy(true);
        setError('');
        let resolvedReferralCode = referralCode;
        if (autoReferralContext?.playlistId) {
          const referralRes = await fetch('/api/v1/linkout/referral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playlistId: autoReferralContext.playlistId,
              email
            })
          });
          const referralData = await referralRes.json();
          if (!referralRes.ok || !referralData.success) {
            throw new Error(referralData.message || referralData.error || 'Failed to create referral');
          }
          resolvedReferralCode = referralData.data?.code || '';
          if (!resolvedReferralCode) {
            throw new Error('Referral code unavailable');
          }
          setReferralCode(resolvedReferralCode);
        }
        const res = await fetch('/api/v1/auth/curator/verify-referral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referralCode: resolvedReferralCode, email })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || data.error || 'Referral validation failed');
        }
        goToStepById('password');
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Verify step: validate the 6-digit code
    if (currentStepId === 'verify') {
      try {
        setBusy(true);
        setError('');
        const res = await fetch('/api/v1/auth/curator/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: verificationCode })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || data.error || 'Verification failed');
        }
        setEmailVerified(true);
        goToStepById('password');
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Pil.bio handle step triggers account creation
    if (currentStepId === 'pilbio') {
      return createAccountAndInitialSetup();
    }

    // Profile image step is final
    if (currentStepId === 'image') {
      return finishOnboarding();
    }

    // Default: advance to next step
    setStep((s) => Math.min(STEP_CONFIG.length - 1, s + 1));
  };

  const onBack = () => {
    setError(''); // Clear error state when navigating back
    setStep((s) => Math.max(0, s - 1));
  };

  // Resend verification code handler
  const handleResendCode = async () => {
    if (resendCooldown > 0 || busy) return;
    try {
      setBusy(true);
      setError('');
      const res = await fetch('/api/v1/auth/curator/open-signup/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to resend code');
      }
      setVerificationExpiresAt(data.expiresAt || null);
      setResendCooldown(data.cooldownSeconds || 60);
      setStatus('Verification code sent to your email');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Resend cooldown timer effect
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);
  
  // Frontend-only validation for handle format
  const getHandleValidationMessage = () => {
    if (!desiredHandle) return 'lowercase letters, numbers, and hyphens only (3-32 characters)';
    if (isValidHandle(desiredHandle)) return '✅ Valid format';
    return '❌ Must be 3-32 characters, lowercase letters, numbers, and hyphens only';
  };
  
  // Live preview helpers
  const getLivePreview = () => {
    const currentStepId = getCurrentStepId();
    if (currentStepId === 'identity') {
      if (curatorName && curatorType) {
        const typeLabel = typeOptions.find(option => !option.isHeader && option.value === curatorType)?.label
          || getCuratorTypeLabel(curatorType);
        return `${curatorName} - ${typeLabel}`;
      }
      return 'Live Preview';
    }
    if (currentStepId === 'pilbio') {
      return desiredHandle ? ` your domain:  ${desiredHandle.toLowerCase()}.pil.bio` : ' [NAME].pil.bio';
    }
    return 'Live Preview';
  };

  const totalSteps = STEP_CONFIG.length;
  const clampedStepIndex = Math.min(step, totalSteps - 1);
  const currentStep = STEP_CONFIG[clampedStepIndex];
  const isAutoReferral = Boolean(autoReferralContext?.playlistId);
  const currentStepIdForDesc = getCurrentStepId();
  const stepDescription = (currentStepIdForDesc === 'email' && openSignupMode)
    ? 'enter your email to get started'
    : (currentStepIdForDesc === 'email' && isAutoReferral)
    ? 'enter your email to apply'
    : currentStep?.description;
  const progressPercent = totalSteps > 1 ? (clampedStepIndex / (totalSteps - 1)) * 100 : 100;

    const handleFormSubmit = (e) => {
      e.preventDefault();
      if (busy) return;
      if (canNext()) {
        onNext();
      }
    };

  

    return (

      

      <FullViewportContainer>

  

        <WizardCard as="form" onSubmit={handleFormSubmit}>

        <ProgressTrack
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-valuenow={clampedStepIndex + 1}
          aria-label="Signup progress"
        >
          <ProgressFill $percent={progressPercent} />
        </ProgressTrack>
        <WizardHeader>
        <StepBadge>{`Step ${clampedStepIndex + 1} of ${totalSteps}`}</StepBadge>

        <LogoSection>
          <a href="/home" aria-label="Go to homepage">
            <img src="/logo.png" alt="Logo" />
          </a>
        </LogoSection>
          <StepTitle>{currentStep?.title}</StepTitle>
          <StepDescription>{stepDescription}</StepDescription>
        </WizardHeader>



        <StepContent>
          {(error || status) && (
            <StatusMessage $type={error ? 'error' : 'success'}>
              {error || status}
            </StatusMessage>
          )}

          {(getCurrentStepId() === 'identity' || getCurrentStepId() === 'pilbio') && (
            <LivePreview role="status" aria-live="polite">{getLivePreview()}</LivePreview>
          )}

          {getCurrentStepId() === 'email' && (
            <>
              <FieldStack>
                {!openSignupMode && !autoReferralContext?.playlistId && (
                  <InputGroup>
                    <InputLabel>Referral Code</InputLabel>
                    <Input
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.trim())}
                      placeholder="Enter referral code"
                    />
                  </InputGroup>
                )}
                <InputGroup>
                  <InputLabel>Email</InputLabel>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.trim())}
                    placeholder="your@email.com"
                  />
                </InputGroup>
              </FieldStack>
            </>
          )}

          {getCurrentStepId() === 'verify' && (
            <>
              <FieldStack>
                <InputGroup>
                  <InputLabel>Verification Code</InputLabel>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    autoComplete="one-time-code"
                  />
                  <InstructionText>
                    Check your email ({email}) for the verification code
                  </InstructionText>
                </InputGroup>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleResendCode}
                  disabled={busy || resendCooldown > 0}
                  style={{ alignSelf: 'center' }}
                >
                  {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                </Button>
              </FieldStack>
            </>
          )}

          {getCurrentStepId() === 'password' && (
            <>
              <FieldStack>
                <InputGroup>
                  <InputLabel>Password</InputLabel>
                  <PasswordInputWrapper>
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPwdTouched(true);
                      }}
                      onFocus={() => setPwdTouched(true)}
                      placeholder="Enter your password"
                      style={{ paddingRight: '60px' }}
                    />
                    <PasswordToggleButton
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </PasswordToggleButton>
                  </PasswordInputWrapper>
                  <PasswordRequirements>
                    {(() => {
                      const c = passwordChecks(password);
                      return (
                        <>
                          <RequirementItem
                            $met={c.length}
                            title={c.length ? "Requirement met" : "At least 10 characters required"}
                          >
                            <RequirementIcon>{c.length ? '✅' : '⭕'}</RequirementIcon>
                            <span>At least 10 characters</span>
                          </RequirementItem>
                          <RequirementItem
                            $met={c.upper}
                            title={c.upper ? "Requirement met" : "At least one uppercase letter required"}
                          >
                            <RequirementIcon>{c.upper ? '✅' : '⭕'}</RequirementIcon>
                            <span>At least one uppercase letter (A-Z)</span>
                          </RequirementItem>
                          <RequirementItem
                            $met={c.number}
                            title={c.number ? "Requirement met" : "At least one number required"}
                          >
                            <RequirementIcon>{c.number ? '✅' : '⭕'}</RequirementIcon>
                            <span>At least one number (0-9)</span>
                          </RequirementItem>
                        </>
                      );
                    })()}
                  </PasswordRequirements>
                  <InstructionText>
                    Use the show/hide toggle to verify your password
                  </InstructionText>
                </InputGroup>
              </FieldStack>
            </>
          )}

          {getCurrentStepId() === 'identity' && (
            <>
              <FieldStack>
                <InputGroup>
                  <InputLabel>Profile Name</InputLabel>
                  <Input 
                    value={curatorName} 
                    onChange={(e) => setCuratorName(e.target.value)}
                    placeholder="Your curator name"
                  />
                </InputGroup>
                <InputGroup>
                  <InputLabel>Profile Type</InputLabel>
                  <SelectField
                    value={curatorType}
                    onChange={(e) => setCuratorType(e.target.value)}
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
                  </SelectField>
                </InputGroup>
                <InputGroup>
                  <InputLabel>Location (optional)</InputLabel>
                  <LocationAutocomplete
                    value={location}
                    onChange={(data) => {
                      const formatted = data?.formatted || '';
                      setLocation(formatted);
                      if (formatted) {
                        setLocationDetails({
                          formatted,
                          city: data?.city || '',
                          country: data?.country || '',
                          lat: typeof data?.lat === 'number' ? data.lat : null,
                          lng: typeof data?.lng === 'number' ? data.lng : null,
                          raw: data?.raw || data?.description || '',
                          placeId: data?.placeId || ''
                        });
                      } else {
                        setLocationDetails(null);
                      }
                    }}
                    placeholder="City, Country"
                  />
                  <InstructionText>Start typing to search for your city</InstructionText>
                </InputGroup>
              </FieldStack>
            </>
          )}

          {getCurrentStepId() === 'pilbio' && (
            <>

              <FieldStack>

                <InputGroup>

                  <InputLabel>Handle</InputLabel>
                  <Input 
                    value={desiredHandle} 
                    onChange={(e) => setDesiredHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="name"
                  />
                  <InstructionText>
                    {getHandleValidationMessage()}
                  </InstructionText>
                </InputGroup>
              </FieldStack>
            </>
          )}

          {getCurrentStepId() === 'image' && (
            <>
              <CompactImageContainer>
                <ImageUpload
                  currentImage={profileImage}
                  onImageUpload={setProfileImage}
                  disabled={busy || !getCsrfToken()}
                  uploadType="curators"
                  title=""
                  subtitle=""
                  previewAlt="Profile image preview"
                />
              </CompactImageContainer>
              {!getCsrfToken() && (
                <InstructionText>

                </InstructionText>
              )}
            </>
          )}

        </StepContent>

        <ActionRow>
            <Button type="button" onClick={onBack} disabled={busy || step === 0}>Back</Button>
            <Button variant="primary" type="submit" disabled={busy || !canNext()}>
              {getCurrentStepId() === 'pilbio' ? 'Create Account' :
               getCurrentStepId() === 'image' ? (profileImage ? 'Save & Complete' : 'Skip & Complete') :
               getCurrentStepId() === 'verify' ? 'Verify' : 'Next'}
            </Button>
          </ActionRow>
      </WizardCard>
    </FullViewportContainer>
  );
}
