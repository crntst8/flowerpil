/* @refresh skip */
import React, { useEffect, useMemo, useState } from 'react';
import moduleLoader from './index.js'; // your singleton
import { ModuleContext } from './ModuleContext.js';

export function ModuleProvider({ children }) {
  const [loaded, setLoaded] = useState(false);
  const [moduleCount, setModuleCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const markLabel = '[ModuleProvider] bootstrap';
    const shouldTime = import.meta.env?.DEV && typeof console.time === 'function';
    if (shouldTime) console.time(markLabel);

    try {
      const factories = import.meta.glob('/src/modules/*/index.js');
      const manifests = import.meta.glob('/src/modules/*/manifest.js', { eager: true });

      const manifestById = new Map();
      for (const [p, mod] of Object.entries(manifests)) {
        const m = p.match(/\/src\/modules\/([^/]+)\/manifest\.js$/);
        if (m) manifestById.set(m[1], mod?.default ?? mod);
      }

      for (const [p, factoryFn] of Object.entries(factories)) {
        const m = p.match(/\/src\/modules\/([^/]+)\/index\.js$/);
        if (!m) continue;
        const moduleId = m[1];
        const manifest = manifestById.get(moduleId);

        if (!manifest) {
          if (import.meta.env?.DEV) {
            console.warn(`[ModuleProvider] Missing manifest for module "${moduleId}" (${p}). Module not registered.`);
          }
          continue;
        }

        moduleLoader.modules ??= new Map();
        if (!moduleLoader.modules.has(moduleId)) {
          moduleLoader.modules.set(moduleId, factoryFn);
        }

        if (typeof moduleLoader.registerConfig === 'function') {
          moduleLoader.registerConfig(moduleId, manifest);
        } else {
          moduleLoader.moduleConfigs ??= new Map();
          moduleLoader.moduleConfigs.set(moduleId, manifest);
          moduleLoader.validateModuleConfig?.(manifest);
        }
      }

      if (!cancelled) {
        setLoaded(true);
        setModuleCount(moduleLoader.moduleConfigs?.size ?? 0);
      }
    } catch (err) {
      console.error('Failed to initialize modules:', err);
      setLoaded(true);
    } finally {
      if (!cancelled && shouldTime && typeof console.timeEnd === 'function') {
        console.timeEnd(markLabel);
      }
    }

    const onLoaded = () => setModuleCount(moduleLoader.moduleConfigs?.size ?? 0);
    moduleLoader.eventBus?.on?.('module:loaded', onLoaded);
    return () => {
      cancelled = true;
      moduleLoader.eventBus?.off?.('module:loaded', onLoaded);
    };
  }, []);

  const ctx = useMemo(() => ({
    moduleLoader,
    loaded,
    moduleCount,
    loadModule: (moduleId) => moduleLoader.load(moduleId),
    getModule: (moduleId) => moduleLoader.getModule(moduleId),
    isFeatureEnabled: (flag) => moduleLoader.isFeatureEnabled(flag),
    emit: (event, data) => moduleLoader.eventBus.emit(event, data),
    store: moduleLoader.store,
  }), [loaded, moduleCount]);

  if (!loaded) return <div className="loading">...</div>;

  return (
    <ModuleContext.Provider value={ctx}>
      {children}
    </ModuleContext.Provider>
  );
}

export default ModuleProvider;
