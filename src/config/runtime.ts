import env from 'env-var';

type NodeEnv = 'development' | 'test' | 'production' | string;

export type RuntimeConfig = {
  node: { env: NodeEnv; port: number };
  cors: { allowedOrigins: string[]; allowedHeaders: string[]; methods: string[]; credentials: boolean; debug: boolean };
  logging: { httpDebug: boolean; level: string; gameEvents: boolean };
  rateLimit: { enabled: boolean };
  bots: { enabled: boolean };
  microservice: { baseUrl: string };
  settlement: { jobLeaseMs: number };
  pricing: {
    arcadeMaxStakeMove: number;
    arcadeMaxStakeWdl: number;
    arcadeMoveMargin: number;
    arcadeMoveMaxOdds: number;
    arcadeDeltaExpK: number;
    poolRake: number;
    pricingModelVersion: string;
  };
  request: { idHeaders: string[] };
  admin: { keyConfigured: boolean };
};

function parseOrigins(nodeEnv: NodeEnv): string[] {
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (envOrigins.length) return envOrigins;
  return nodeEnv === 'production'
    ? ['https://betmate-prod.netlify.app', 'https://betmate-dev.netlify.app']
    : ['http://localhost:3000', 'http://localhost:8000', 'http://localhost:8080'];
}

export function getRuntimeConfig(): RuntimeConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development') as NodeEnv;

  const config: RuntimeConfig = {
    node: {
      env: nodeEnv,
      port: env.get('PORT').default('9000').asIntPositive(),
    },
    cors: {
      allowedOrigins: parseOrigins(nodeEnv),
      allowedHeaders: [
        'Content-Type', 'Authorization',
        'X-Admin-Key', 'x-admin-key',
        'X-Request-Id', 'x-request-id',
        'X-Trace-Id', 'x-trace-id',
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
      debug: env.get('CORS_DEBUG').default('false').asBoolStrict(),
    },
    logging: {
      httpDebug: env.get('LOG_HTTP_DEBUG').default('false').asBoolStrict(),
      level: (process.env.LOG_LEVEL || 'info'),
      gameEvents: env.get('LOG_GAME_EVENTS').default('false').asBoolStrict(),
    },
    rateLimit: {
      enabled: (nodeEnv === 'production') || env.get('ENABLE_RATE_LIMITING').default('false').asBoolStrict(),
    },
    bots: {
      enabled: env.get('ENABLE_BOTS').default('false').asBoolStrict(),
    },
    microservice: {
      baseUrl: env.get('MICROSERVICE_URL').default('http://localhost:8000').asString(),
    },
    settlement: {
      jobLeaseMs: env.get('SETTLEMENT_JOB_LEASE_MS').default('10000').asIntPositive(),
    },
    pricing: {
      arcadeMaxStakeMove: env.get('ARCADE_MAX_STAKE_MOVE').default('25').asFloatPositive(),
      arcadeMaxStakeWdl: env.get('ARCADE_MAX_STAKE_WDL').default('50').asFloatPositive(),
      arcadeMoveMargin: env.get('ARCADE_MOVE_MARGIN').default('0.08').asFloatPositive(),
      arcadeMoveMaxOdds: env.get('ARCADE_MOVE_MAX_ODDS').default('25').asFloatPositive(),
      arcadeDeltaExpK: env.get('ARCADE_DELTA_EXP_K').default('0.03').asFloatPositive(),
      poolRake: env.get('POOL_RAKE').default('0.05').asFloatPositive(),
      pricingModelVersion: process.env.PRICING_MODEL_VERSION || 'v0',
    },
    request: { idHeaders: ['X-Request-Id', 'X-Trace-Id'] },
    admin: { keyConfigured: !!process.env.ADMIN_API_KEY },
  };

  return config;
}

export function getPublicRuntimeConfig() {
  const cfg = getRuntimeConfig();
  return {
    node: { env: cfg.node.env },
    cors: { allowedOrigins: cfg.cors.allowedOrigins },
    logging: { httpDebug: cfg.logging.httpDebug },
    rateLimit: cfg.rateLimit,
    bots: cfg.bots,
    microservice: { baseUrl: cfg.microservice.baseUrl },
    settlement: cfg.settlement,
    pricing: cfg.pricing,
    request: cfg.request,
    admin: { keyConfigured: cfg.admin.keyConfigured },
  };
}

export default { getRuntimeConfig, getPublicRuntimeConfig };
