// Save as: src/core/hooks/useModuleEvents.js
// MODULE: useModuleEvents | DEPS: [react, ModuleProvider] | PURPOSE: Hook for module events

import { useEffect } from 'react';
import { useModule } from '../module-loader/ModuleContext.js';
export function useModuleEvents(eventHandlers) {
  const { moduleLoader } = useModule();

  useEffect(() => {
    const cleanup = [];

    Object.entries(eventHandlers).forEach(([event, handler]) => {
      moduleLoader.eventBus.on(event, handler, 'hook');
      cleanup.push(() => moduleLoader.eventBus.off(event, handler));
    });

    return () => cleanup.forEach(fn => fn());
  }, [moduleLoader.eventBus, eventHandlers]);
}
