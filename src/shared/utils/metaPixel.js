const META_PIXEL_SCRIPT = 'https://connect.facebook.net/en_US/fbevents.js';

const state = {
  enabled: false,
  consentStatus: 'unknown',
  mode: 'curator',
  globalPixelId: '',
  curatorPixelId: '',
  advancedMatching: null,
  initializedPixels: new Set(),
  scriptLoaded: false,
  loadingPromise: null
};

const normalizeId = (value) => (typeof value === 'string' ? value.trim() : '');

const shouldTrack = (pixelIds) => {
  return state.enabled && state.consentStatus === 'granted_ads' && pixelIds.length > 0;
};

const ensureStub = () => {
  if (typeof window === 'undefined') return;
  if (window.fbq) return;

  const fbq = function () {
    fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
  };
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.callMethod = fbq.callMethod || null;
  window.fbq = fbq;
  window._fbq = fbq;
};

const loadScript = () => {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (state.scriptLoaded) return Promise.resolve(true);
  if (state.loadingPromise) return state.loadingPromise;

  ensureStub();

  state.loadingPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = META_PIXEL_SCRIPT;
    script.onload = () => {
      state.scriptLoaded = true;
      resolve(true);
    };
    script.onerror = () => {
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return state.loadingPromise;
};

export const createEventId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `fp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

export const buildEventId = (baseId, pixelId) => `${baseId}:${pixelId}`;

export const resolvePixelTargets = ({ mode, globalPixelId, curatorPixelId }) => {
  const resolvedMode = mode || 'curator';
  const globalId = normalizeId(globalPixelId);
  const curatorId = normalizeId(curatorPixelId);
  const targets = new Set();

  if (resolvedMode === 'global' || resolvedMode === 'both') {
    if (globalId) targets.add(globalId);
  }
  if (resolvedMode === 'curator' || resolvedMode === 'both') {
    if (curatorId) targets.add(curatorId);
  }

  return Array.from(targets);
};

const getPixelTargets = ({ curatorPixelId } = {}) => {
  return resolvePixelTargets({
    mode: state.mode,
    globalPixelId: state.globalPixelId,
    curatorPixelId: curatorPixelId || state.curatorPixelId
  });
};

const initPixels = async ({ pixelIds, advancedMatching }) => {
  const ids = pixelIds || getPixelTargets();
  if (!ids.length) return false;

  const loaded = await loadScript();
  if (!loaded || typeof window === 'undefined' || !window.fbq) return false;

  ids.forEach((pixelId) => {
    if (state.initializedPixels.has(pixelId)) return;
    if (advancedMatching) {
      window.fbq('init', pixelId, advancedMatching);
    } else {
      window.fbq('init', pixelId);
    }
    state.initializedPixels.add(pixelId);
  });

  return true;
};

export const configureMetaPixel = ({
  enabled,
  consentStatus,
  mode,
  globalPixelId,
  curatorPixelId,
  advancedMatching
}) => {
  state.enabled = enabled === true;
  state.consentStatus = consentStatus || 'unknown';
  state.mode = mode || 'curator';
  state.globalPixelId = normalizeId(globalPixelId);
  state.curatorPixelId = normalizeId(curatorPixelId);
  state.advancedMatching = advancedMatching || null;

  const targets = getPixelTargets();
  if (shouldTrack(targets)) {
    initPixels({ pixelIds: targets, advancedMatching: state.advancedMatching });
  }
};

export const canTrackMetaPixel = ({ curatorPixelId } = {}) => {
  return shouldTrack(getPixelTargets({ curatorPixelId }));
};

export const getMetaPixelTargets = ({ curatorPixelId } = {}) => {
  return getPixelTargets({ curatorPixelId });
};

export const trackPageView = async ({ eventIdBase, curatorPixelId } = {}) => {
  const pixelIds = getPixelTargets({ curatorPixelId });
  if (!shouldTrack(pixelIds)) return false;

  const baseId = eventIdBase || createEventId();
  const initialized = await initPixels({ pixelIds, advancedMatching: state.advancedMatching });
  if (!initialized || typeof window === 'undefined' || !window.fbq) return false;

  pixelIds.forEach((pixelId) => {
    window.fbq('trackSingle', pixelId, 'PageView', {}, { eventID: buildEventId(baseId, pixelId) });
  });

  return true;
};

export const trackEvent = async ({
  eventName,
  params = {},
  eventIdBase,
  curatorPixelId
} = {}) => {
  if (!eventName) return false;
  const pixelIds = getPixelTargets({ curatorPixelId });
  if (!shouldTrack(pixelIds)) return false;

  const baseId = eventIdBase || createEventId();
  const initialized = await initPixels({ pixelIds, advancedMatching: state.advancedMatching });
  if (!initialized || typeof window === 'undefined' || !window.fbq) return false;

  pixelIds.forEach((pixelId) => {
    window.fbq('trackSingle', pixelId, eventName, params, { eventID: buildEventId(baseId, pixelId) });
  });

  return true;
};

export default {
  configureMetaPixel,
  canTrackMetaPixel,
  getMetaPixelTargets,
  trackPageView,
  trackEvent,
  createEventId,
  buildEventId,
  resolvePixelTargets
};
