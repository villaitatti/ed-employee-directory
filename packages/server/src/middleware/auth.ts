import type { Request, RequestHandler } from 'express';
import { expressjwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import { env } from '../env.js';
import { HttpError } from './error.js';

export type AuthUser = {
  sub: string;
  email: string | undefined;
  roles: string[];
  scope: string[];
};

export type AuthenticatedRequest = Request & {
  authUser: AuthUser;
};

type JwtPayload = {
  sub?: string;
  email?: string;
  scope?: string;
  permissions?: string[];
  [key: string]: unknown;
};

function extractRoles(payload: JwtPayload): string[] {
  const rawRoles = payload[env.AUTH0_ROLES_CLAIM];
  if (Array.isArray(rawRoles)) {
    return rawRoles.filter((role): role is string => typeof role === 'string');
  }
  if (typeof rawRoles === 'string') {
    return rawRoles.split(' ').filter(Boolean);
  }
  return [];
}

function extractScope(payload: JwtPayload): string[] {
  const spaceSeparated = typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
  const permissions = Array.isArray(payload.permissions)
    ? payload.permissions.filter((permission): permission is string => typeof permission === 'string')
    : [];
  return [...new Set([...spaceSeparated, ...permissions])];
}

const jwtMiddleware = expressjwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`,
  }) as never,
  audience: env.AUTH0_AUDIENCE,
  issuer: `https://${env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256'],
});

export const requireAuth: RequestHandler[] = [
  env.DEV_SKIP_AUTH
    ? (req, _res, next) => {
        (req as AuthenticatedRequest).authUser = {
          sub: 'dev|staff-it',
          email: 'dev.staff-it@example.test',
          roles: [env.AUTH0_STAFF_ROLE],
          scope: [env.AUTH0_READ_SCOPE, env.AUTH0_WRITE_SCOPE],
        };
        next();
      }
    : jwtMiddleware,
  (req, _res, next) => {
    if ((req as AuthenticatedRequest).authUser) {
      next();
      return;
    }

    const payload = (req as Request & { auth?: JwtPayload }).auth;
    if (!payload?.sub) {
      next(new HttpError(401, 'UNAUTHORIZED', 'A valid bearer token is required.'));
      return;
    }

    (req as AuthenticatedRequest).authUser = {
      sub: payload.sub,
      email: payload.email,
      roles: extractRoles(payload),
      scope: extractScope(payload),
    };
    next();
  },
];

export const requireStaff: RequestHandler = (req, _res, next) => {
  const user = (req as AuthenticatedRequest).authUser;
  if (!user?.roles.includes(env.AUTH0_STAFF_ROLE)) {
    next(new HttpError(403, 'FORBIDDEN', `Role ${env.AUTH0_STAFF_ROLE} is required.`));
    return;
  }
  next();
};

export const requireReadAccess: RequestHandler = (req, _res, next) => {
  const user = (req as AuthenticatedRequest).authUser;
  if (user?.roles.includes(env.AUTH0_STAFF_ROLE) || user?.scope.includes(env.AUTH0_READ_SCOPE)) {
    next();
    return;
  }
  next(new HttpError(403, 'FORBIDDEN', `Scope ${env.AUTH0_READ_SCOPE} or role ${env.AUTH0_STAFF_ROLE} is required.`));
};

/**
 * Guards the one field an external client may write. Deliberately keyed off its
 * own scope rather than AUTH0_READ_SCOPE so the Ferie portal's read-only sync
 * credentials cannot mutate anything, and a read token leak stays read-only.
 */
export const requireWriteAccess: RequestHandler = (req, _res, next) => {
  const user = (req as AuthenticatedRequest).authUser;
  if (user?.roles.includes(env.AUTH0_STAFF_ROLE) || user?.scope.includes(env.AUTH0_WRITE_SCOPE)) {
    next();
    return;
  }
  next(new HttpError(403, 'FORBIDDEN', `Scope ${env.AUTH0_WRITE_SCOPE} or role ${env.AUTH0_STAFF_ROLE} is required.`));
};
