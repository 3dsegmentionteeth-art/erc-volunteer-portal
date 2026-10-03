import { buildApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { pgPool, prisma } from './lib/prisma';

async function main(): Promise<void> {
  await prisma.$connect();
  const app = buildApp();
  const server = app.listen(config.port, () => {
    logger.info(`ERC portal API listening on http://localhost:${config.port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      prisma.$disconnect().finally(() => {
        pgPool.end().finally(() => process.exit(0));
      });
    });
    // Hard exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal error during startup.', err);
  process.exit(1);
});