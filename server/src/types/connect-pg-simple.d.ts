declare module 'connect-pg-simple' {
  import session from 'express-session';
  import { Pool } from 'pg';

  interface ConnectPgSimpleOptions {
    pool?: Pool;
    conString?: string;
    tableName?: string;
    schemaName?: string;
    pruneSessionInterval?: number | false;
    createTableIfMissing?: boolean;
    ttl?: number;
    errorLog?: (...args: unknown[]) => void;
  }

  type StoreCtor = new (options?: ConnectPgSimpleOptions) => session.Store;
  function connectPgSimple(session: typeof import('express-session')): StoreCtor;
  export default connectPgSimple;
}