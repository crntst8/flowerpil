import EventBus from '../events/EventBus.js';
import Store from '../store/Store.js';

class ModuleLoader {
  registerConfig(moduleId, config) {
    this.moduleConfigs.set(moduleId, config);
   this.validateModuleConfig?.(config);
    this.eventBus.emit('module:loaded', moduleId);
 }
  constructor() {
    this.modules = new Map();
    this.moduleConfigs = new Map();
    this.loadedModules = new Set();
    this.loadedModuleInstances = new Map(); // Store actual loaded module instances
    this.eventBus = new EventBus();
    this.store = new Store(this.eventBus);
    this.hooks = new Map();
    
  }

  /**
   * Register a module with the system
   */
  async register(moduleId, moduleFactory) {
    if (this.modules.has(moduleId)) {
      console.warn(`Module ${moduleId} is already registered`);
      return;
    }

    this.modules.set(moduleId, moduleFactory);
    
    // Auto-load module config if available
    try {
      const module = await moduleFactory();
      
      // Handle null modules (disabled modules)
      if (!module || module.default === null) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`Module ${moduleId} is disabled - skipping registration`);
        }
        return;
      }
      
      if (module.default?.config) {
        this.moduleConfigs.set(moduleId, module.default.config);
        this.validateModuleConfig(module.default.config);
      } else if (module.config) {
        this.moduleConfigs.set(moduleId, module.config);
        this.validateModuleConfig(module.config);
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Module ${moduleId} has no config property`);
        }
      }
    } catch (error) {
      console.error(`Failed to load config for module ${moduleId}:`, error);
    }
  }

  /**
   * Load a module and initialize it
   */
  async load(moduleId) {
    if (this.loadedModules.has(moduleId)) {
      return this.loadedModuleInstances.get(moduleId);
    }

    const moduleFactory = this.modules.get(moduleId);
    if (!moduleFactory) {
      throw new Error(`Module ${moduleId} not found`);
    }

    try {
      const moduleImport = await moduleFactory();
      const module = moduleImport.default || moduleImport;
      const config = module.config || this.moduleConfigs.get(moduleId);

      // Check dependencies
      if (config?.dependencies) {
        for (const dep of config.dependencies) {
          if (!this.loadedModules.has(dep)) {
            await this.load(dep);
          }
        }
      }

      // Initialize module store
      if (module.store) {
        this.store.registerModule(moduleId, module.store.initialState);
      }

      // Register event listeners
      if (config?.events?.listens) {
        for (const event of config.events.listens) {
          if (module.eventHandlers?.[event]) {
            this.eventBus.on(event, module.eventHandlers[event], moduleId);
          }
        }
      }

      // Initialize module
      if (module.initialize) {
        await module.initialize({
          moduleId,
          eventBus: this.eventBus,
          store: this.store.getModuleStore(moduleId),
          emit: (event, data) => this.eventBus.emit(event, data),
          getModule: (id) => this.getModule(id),
        });
      }

      // Store the loaded module instance
      this.loadedModuleInstances.set(moduleId, module);
      this.loadedModules.add(moduleId);
      this.eventBus.emit('module:loaded', { moduleId });

      return module;
    } catch (error) {
      console.error(`Failed to load module ${moduleId}:`, error);
      throw error;
    }
  }

  /**
   * Get a loaded module
   */
  getModule(moduleId) {
    if (!this.loadedModules.has(moduleId)) {
      throw new Error(`Module ${moduleId} is not loaded`);
    }
    return this.loadedModuleInstances.get(moduleId);
  }

  /**
   * Get module configuration
   */
  getConfig(moduleId) {
    return this.moduleConfigs.get(moduleId);
  }

  /**
   * Validate module configuration
   */
  validateModuleConfig(config) {
    const required = ['id', 'name', 'version'];
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Module config missing required field: ${field}`);
      }
    }
  }

  /**
   * Get module context for LLM understanding
   */
  getContext(moduleId) {
    const config = this.moduleConfigs.get(moduleId);
    const isLoaded = this.loadedModules.has(moduleId);
    
    return {
      id: moduleId,
      name: config?.name || moduleId,
      version: config?.version || 'unknown',
      loaded: isLoaded,
      dependencies: config?.dependencies || [],
      routes: config?.routes || [],
      events: config?.events || {},
      features: config?.features || {},
    };
  }

  /**
   * Get all module contexts
   */
  getAllContexts() {
    const contexts = {};
    for (const [moduleId] of this.modules) {
      contexts[moduleId] = this.getContext(moduleId);
    }
    return contexts;
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(featureFlag) {
    const [moduleId, feature] = featureFlag.split('.');
    const config = this.moduleConfigs.get(moduleId);
    return config?.features?.[feature] ?? false;
  }

  /**
   * Register a hook
   */
  registerHook(hookName, handler, moduleId) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName).push({ handler, moduleId });
  }

  /**
   * Execute hooks
   */
  async executeHooks(hookName, ...args) {
    const hooks = this.hooks.get(hookName) || [];
    const results = [];
    
    for (const { handler, moduleId } of hooks) {
      try {
        const result = await handler(...args);
        results.push({ moduleId, result });
      } catch (error) {
        console.error(`Hook error in ${moduleId}:`, error);
      }
    }
    
    return results;
  }
}

// Create singleton instance
const moduleLoader = new ModuleLoader();

export default moduleLoader;