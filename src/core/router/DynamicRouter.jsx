import React, { Suspense, lazy, useMemo, useRef } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { useModule } from '../module-loader/ModuleContext.js';
import PrivateRoute from '@shared/components/PrivateRoute';
import logger from '../../utils/logger';
import { theme } from '@shared/styles/GlobalStyles';

function NotFound() {
  return (
    <div
      className="not-found"
      style={{
        padding: '2rem',
        textAlign: 'center',
        fontFamily: theme.fonts.primary,
      }}
    >
      <h3
        style={{
          fontSize: theme.fontSizes.h3,
          fontWeight: theme.fontWeights.bold,
          marginBottom: '1rem',
        }}
      >
        still haven't found what yr looking for - bono of the band U-2
      </h3>
      <p>
        <Link
          to="/"
          style={{
            textDecoration: 'underline',
            fontFamily: theme.fonts.primary,
            fontSize: theme.fontSizes.body,
            fontWeight: theme.fontWeights.light,
          }}
        >
          go back
        </Link>
      </p>
    </div>
  );
}

export default function DynamicRouter() {
  const { moduleLoader, loaded, moduleCount } = useModule();
  const lastLoggedModuleCount = useRef(0);
  
  if (!loaded) {
    return <div className="loading">Loading...</div>;
  }

  const routes = useMemo(() => {
    const collectedRoutes = [];

    for (const [moduleId, config] of moduleLoader.moduleConfigs) {
      if (config.routes) {
        config.routes.forEach(route => {
          const LazyComponent = lazy(() =>
            moduleLoader.load(moduleId).then(module => {
              const Component = module.components?.[route.component];
              if (!Component) {
                logger.error('DynamicRouter', `Component ${route.component} not found in module ${moduleId}`);
                return { default: () => <div>Component {route.component} not found in {moduleId}</div> };
              }
              return { default: Component };
            })
          );

          const isAdminModule = moduleId === 'admin';
          const isCuratorModule = moduleId === 'curator';

          const requiresAuth =
            (isAdminModule && !route.path.startsWith('/auth/')) ||
            (isCuratorModule && route.path !== '/signup' && route.path !== '/curator-admin/login');

          const allowedRoles = isAdminModule
            ? ['admin']
            : isCuratorModule
              ? ['curator', 'admin']
              : [];

          const redirectTo =
            isCuratorModule && requiresAuth ? '/curator-admin/login' : undefined;

          collectedRoutes.push({
            ...route,
            moduleId,
            component: LazyComponent,
            requiresAuth,
            allowedRoles,
            redirectTo,
          });
        });
      }
    }

    if (process.env.NODE_ENV === 'development' && lastLoggedModuleCount.current === 0) {
      lastLoggedModuleCount.current = collectedRoutes.length;
      logger.info('DynamicRouter', `Routes registered: ${collectedRoutes.length}`, {
        routes: collectedRoutes.map(r => ({ path: r.path, module: r.moduleId })),
      });
    }

    return collectedRoutes;
  }, [moduleLoader.moduleConfigs, moduleCount]);

  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <Routes>
        {routes.map((route, index) => {
          const element = route.requiresAuth ? (
            <PrivateRoute
              allowedRoles={
                route.allowedRoles && route.allowedRoles.length
                  ? route.allowedRoles
                  : undefined
              }
              redirectTo={route.redirectTo}
            >
              <route.component />
            </PrivateRoute>
          ) : (
            <route.component />
          );

          return (
            <Route
              key={`${route.moduleId}-${index}`}
              path={route.path}
              element={element}
            />
          );
        })}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}