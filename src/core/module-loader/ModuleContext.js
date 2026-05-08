import { createContext, useContext } from 'react';

// Single context used by both the provider and hooks.
export const ModuleContext = createContext(null);

export function useModule() {
  const ctx = useContext(ModuleContext);
  if (!ctx) throw new Error('useModule must be used within ModuleProvider');
  return ctx;
}

export function useModuleLoader() {
  const ctx = useContext(ModuleContext);
  if (!ctx) throw new Error('useModuleLoader must be used within ModuleProvider');
  return ctx.moduleLoader;
}
