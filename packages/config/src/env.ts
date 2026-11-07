import { z } from 'zod';

/**
 * Server env schema. AUTH_MODE=dev is a local-only sign-in used until Clerk keys exist;
 * it refuses to run in production.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    APP_DATABASE_URL: z.string().url(),
    AUTH_MODE: z.enum(['clerk', 'dev']).default('dev'),
    DEV_AUTH_SECRET: z.string().min(32).optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
    CLERK_SECRET_KEY: z.string().optional(),
    ENCRYPTION_MASTER_KEY: z.string().regex(/^[A-Za-z0-9+/]{43}=$/, '32-byte base64 key'),
    /** Lets a local or CI production build use dev sign-in for end-to-end tests. */
    ALLOW_DEV_AUTH_IN_PRODUCTION: z.enum(['true', 'false', '']).optional(),
    VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  })
  .superRefine((env, ctx) => {
    if (
      env.AUTH_MODE === 'clerk' &&
      (!env.CLERK_SECRET_KEY || !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
    ) {
      ctx.addIssue({ code: 'custom', message: 'AUTH_MODE=clerk needs both Clerk keys' });
    }
    if (env.AUTH_MODE === 'dev' && !env.DEV_AUTH_SECRET) {
      ctx.addIssue({ code: 'custom', message: 'AUTH_MODE=dev needs DEV_AUTH_SECRET' });
    }
    if (env.AUTH_MODE === 'dev' && env.VERCEL_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        message: 'Dev sign-in can never run on a production deployment.',
      });
    }
    if (
      env.AUTH_MODE === 'dev' &&
      env.NODE_ENV === 'production' &&
      env.ALLOW_DEV_AUTH_IN_PRODUCTION !== 'true'
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Dev sign-in is disabled in production builds. Configure Clerk.',
      });
    }
  });

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;
export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}
