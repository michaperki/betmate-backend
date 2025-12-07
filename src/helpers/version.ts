export interface VersionInfo {
  appVersion: string;
  environment: string;
  commit?: string;
  release?: string; // e.g., v123
  releasedAtISO?: string;
}

export function getVersionInfo(): VersionInfo {
  const appVersion = process.env.npm_package_version || '1.0.0';
  const environment = process.env.NODE_ENV || 'development';
  const commit = process.env.SOURCE_VERSION || process.env.HEROKU_SLUG_COMMIT || undefined;
  const release = process.env.HEROKU_RELEASE_VERSION || undefined;
  const releasedAtISO = process.env.HEROKU_RELEASE_CREATED_AT || undefined;

  return { appVersion, environment, commit, release, releasedAtISO };
}

export default { getVersionInfo };

