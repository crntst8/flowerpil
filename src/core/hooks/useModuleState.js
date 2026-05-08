// Save as: src/core/hooks/useModuleState.js
// MODULE: useModuleState | DEPS: [react, ModuleProvider] | PURPOSE: Hook for module state management

import { useState, useEffect } from 'react';
import { useModule } from '../module-loader/ModuleContext.js';
export function useModuleState(moduleId) {
  const { store } = useModule();
  const moduleStore = store.getModuleStore(moduleId);
  const [state, setState] = useState(moduleStore.getState());

  useEffect(() => {
    const unsubscribe = moduleStore.subscribe(newState => {
      setState(newState);
    });

    return unsubscribe;
  }, [moduleStore]);

  return [state, moduleStore.setState];
}
