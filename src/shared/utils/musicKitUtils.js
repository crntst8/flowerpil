const MUSIC_KIT_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
const DEFAULT_TIMEOUT_MS = 15000;

let musicKitReadyPromise = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isMusicKitReady = () => {
  if (typeof window === 'undefined') return false;
  const MK = window.MusicKit;
  return !!(
    MK &&
    typeof MK.configure === 'function' &&
    typeof MK.getInstance === 'function'
  );
};

export function ensureMusicKitReady({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('MusicKit can only be loaded in a browser'));
  }

  if (isMusicKitReady()) return Promise.resolve();
  if (musicKitReadyPromise) return musicKitReadyPromise;

  musicKitReadyPromise = new Promise((resolve, reject) => {
    let timeoutId;
    let pollIntervalId;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (pollIntervalId) clearInterval(pollIntervalId);
      document.removeEventListener('musickitloaded', onReady);
    };

    const onReady = () => {
      if (!isMusicKitReady()) return;
      cleanup();
      resolve();
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Apple Music SDK initialization timeout'));
    }, timeoutMs);

    document.addEventListener('musickitloaded', onReady);

    const existing = document.querySelector(`script[src="${MUSIC_KIT_SRC}"]`);
    if (!existing) {
      const script = document.createElement('script');
      script.src = MUSIC_KIT_SRC;
      script.async = true;
      script.onload = () => onReady();
      script.onerror = () => {
        cleanup();
        reject(new Error('Failed to load Apple Music SDK'));
      };
      document.head.appendChild(script);
    }

    pollIntervalId = setInterval(onReady, 50);
    onReady();
  }).catch((error) => {
    // Allow retries if the initial load failed or timed out.
    musicKitReadyPromise = null;
    throw error;
  });

  return musicKitReadyPromise;
}

export async function getMusicKitInstance(developerToken, { initWaitTimesMs } = {}) {
  if (!developerToken) throw new Error('Missing Apple Music developer token');

  const initWaitTimes = initWaitTimesMs || [200, 500, 800, 1200];

  await ensureMusicKitReady();

  const MK = window.MusicKit;
  let lastError = null;

  for (const waitMs of initWaitTimes) {
    try {
      await sleep(waitMs);

      let instance;
      try {
        instance = MK.getInstance();
      } catch (error) {
        instance = null;
        lastError = error;
      }

      if (!instance) {
        try {
          MK.configure({ developerToken, app: { name: 'Flowerpil', build: '1.0.0' } });
        } catch (error) {
          lastError = error;
        }

        // Give MusicKit a tick to settle after configure.
        await sleep(0);

        try {
          instance = MK.getInstance();
        } catch (error) {
          instance = null;
          lastError = error;
        }
      }

      if (!instance) throw new Error('MusicKit instance unavailable');
      return instance;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('MusicKit instance unavailable');
}

export async function authorizeMusicKit(music, { retries = 1, retryDelayMs = 250 } = {}) {
  if (!music || typeof music.authorize !== 'function') {
    throw new Error('MusicKit instance unavailable');
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await music.authorize();
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      const transient =
        (message.includes('musickit') && message.includes('unavailable')) ||
        (message.includes('musickit') && message.includes('not available')) ||
        message.includes('not properly initialized') ||
        message.includes('initialization') ||
        message.includes('constructor');

      if (attempt < retries && transient) {
        await sleep(retryDelayMs);
        continue;
      }

      throw error;
    }
  }

  throw new Error('Authorization failed');
}

