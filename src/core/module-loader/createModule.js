// Save as: src/core/module-loader/createModule.js
// MODULE: createModule | DEPS: [] | PURPOSE: Helper to create standardised modules

/**
 * Create a module with standard structure
 * Simplified for single-developer use
 */
export function createModule({
  id,
  name,
  version = '1.0.0',
  dependencies = [],
  routes = [],
  events = {},
  features = {},
  store = null,
  initialize = null,
  components = {},
  services = {},
}) {
  return {
    config: {
      id,
      name,
      version,
      dependencies,
      routes,
      events,
      features,
    },
    store,
    initialize,
    components,
    services,
    // Auto-generate context documentation
    getContext() {
      return {
        id,
        name,
        purpose: `${name} functionality`,
        dependencies,
        routes: routes.map(r => r.path),
        events: {
          emits: events.emits || [],
          listens: events.listens || [],
        },
        lastModified: new Date().toISOString(),
      };
    },
  };
}