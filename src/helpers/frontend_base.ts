export function getFrontendBase(): string {
  const raw = process.env.FRONTEND_URL
    || process.env.PUBLIC_FRONTEND_URL
    || process.env.PROD_FRONTEND_URL
    || process.env.PRODUCTION_FRONTEND_URL
    || 'http://localhost:8080';
  try {
    const u = new URL(raw);
    const isLocalHost = (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    const isLocalEnv = (process.env.TARGET_ENV === 'local' || process.env.NODE_ENV !== 'production');
    if (isLocalHost && isLocalEnv) {
      const preferredPort = String(process.env.LOCAL_FRONTEND_PORT || '8080');
      if (!u.port || u.port !== preferredPort) u.port = preferredPort;
    }
    // Normalize: drop trailing slash
    return u.toString().replace(/\/$/, '');
  } catch (_) {
    return (raw || 'http://localhost:8080').replace(/\/$/, '');
  }
}

export default getFrontendBase;
