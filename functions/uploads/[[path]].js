const EDGE_ERROR_CODES = new Set([502, 503, 504, 521, 522, 523, 524, 525, 526, 527]);

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const pathAndQuery = `${url.pathname}${url.search || ''}`;

  const normalize = (value) => (typeof value === 'string' ? value.trim() : '');
  const envVars = env || {};
  const primaryHost = normalize(envVars.BACKEND_ORIGIN_HOST) || 'api.flowerpil.io';
  const secondaryHostRaw = normalize(envVars.BACKEND_SECONDARY_HOST) || '';
  const originIp = normalize(envVars.BACKEND_ORIGIN_IP);
  const incomingHost = url.host;
  const forwardedProto = url.protocol === 'http:' ? 'http' : 'https';

  const secondaryHost = secondaryHostRaw &&
    secondaryHostRaw !== primaryHost &&
    secondaryHostRaw !== incomingHost
      ? secondaryHostRaw
      : '';

  const attempts = [];
  attempts.push({
    targetHost: primaryHost,
    scheme: 'https',
    sourceRequest: request
  });

  if (secondaryHost) {
    attempts.push({
      targetHost: secondaryHost,
      scheme: 'https',
      sourceRequest: request.clone()
    });
  }

  if (originIp) {
    attempts.push({
      targetHost: primaryHost,
      scheme: 'https',
      resolveOverride: originIp,
      sourceRequest: request.clone()
    });
  }

  for (const { targetHost, scheme, resolveOverride, sourceRequest } of attempts) {
    try {
      const headers = new Headers(sourceRequest.headers);
      headers.set('Host', targetHost);
      headers.set('X-Forwarded-Host', incomingHost);
      headers.set('X-Forwarded-Proto', forwardedProto);
      headers.delete('content-length');

      const method = (sourceRequest.method || request.method || 'GET').toUpperCase();
      const body = method === 'GET' || method === 'HEAD' ? undefined : sourceRequest.body;

      // Enable edge caching for GET/HEAD requests (images are immutable)
      const isReadRequest = method === 'GET' || method === 'HEAD';

      const init = {
        method,
        headers,
        body,
        redirect: 'follow',
        cf: {
          cacheTtl: isReadRequest ? 86400 : 0, // 24 hours for reads
          cacheEverything: isReadRequest,
          cacheKey: isReadRequest ? url.pathname : undefined
        }
      };

      if (resolveOverride) {
        init.cf.resolveOverride = resolveOverride;
      }

      const fetchUrl = `${scheme}://${targetHost}${pathAndQuery}`;
      const response = await fetch(fetchUrl, init);

      if (response.ok || !EDGE_ERROR_CODES.has(response.status)) {
        return response;
      }
    } catch (_) {
      // Continue to next attempt
    }
  }

  return new Response('Origin unavailable', { status: 502 });
}
