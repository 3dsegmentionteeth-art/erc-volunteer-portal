import session from 'express-session';
import connectPgSimpleModule from 'connect-pg-simple';
import { config } from '../config';
import { pgPool } from './prisma';

const PgSession = connectPgSimpleModule(session);

// Server-side session store backed by Postgres (connect-pg-simple). Sessions
// are NEVER held in memory: the store survives restarts and is shared across
// app instances. Session id is regenerated on login (see auth.controller).
export const sessionMiddleware = session({
  store: new PgSession({
    pool: pgPool,
    tableName: 'session',
    createTableIfMissing: false,
  }),
  name: config.sessionCookieName,
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionMaxAgeMs,
    path: '/',
  },
});