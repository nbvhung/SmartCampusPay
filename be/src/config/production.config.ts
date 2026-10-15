function envString(env: Record<string, unknown>, name: string, fallback = '') {
  const value = env[name];
  return typeof value === 'string' ? value : fallback;
}

export function validateEnvironment(env: Record<string, unknown>) {
  if (env.NODE_ENV !== 'production') return env;
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DB_PASS']) {
    const value = envString(env, name);
    if (
      Buffer.byteLength(value) < 32 ||
      /replace|example|change.?me/i.test(value)
    ) {
      throw new Error(
        `${name} must be a unique random secret of at least 32 bytes`,
      );
    }
  }
  if (new Set([env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET]).size !== 2) {
    throw new Error('JWT secrets must be different');
  }
  const origin = new URL(envString(env, 'FRONTEND_URL'));
  if (origin.protocol !== 'https:' || origin.origin !== env.FRONTEND_URL) {
    throw new Error(
      'FRONTEND_URL must be an HTTPS origin without a trailing slash',
    );
  }
  if (env.DB_SYNCHRONIZE === 'true')
    throw new Error('Production requires migrations');
  return env;
}
