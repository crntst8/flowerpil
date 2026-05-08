import { useEffect } from 'react';
import { useAuth } from '@shared/contexts/AuthContext';

function setViewportVar() {
  try {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  } catch (_) {}
}

export default function BfcacheAndViewportFix() {
  useEffect(() => {
    // Initialize viewport variable
    setViewportVar();
    const onResize = () => setViewportVar();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize);

    // Handle Safari bfcache restores
    const onPageShow = (e) => {
      if (e && e.persisted) {
        // Broadcast a soft refresh signal for bfcache restoration
        // (Auth checking is now handled by AuthContext for all pageshow events)
        try { window.dispatchEvent(new CustomEvent('flowerpil:refresh')); } catch (_) {}
      }
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  return null;
}

