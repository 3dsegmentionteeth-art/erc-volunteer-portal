import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { config } from '../config';

export const prisma = new PrismaClient();

// Dedicated pg pool shared with connect-pg-simple (server-side session store).
export const pgPool = new Pool({ connectionString: config.databaseUrl });