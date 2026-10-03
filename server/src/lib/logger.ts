type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVEL_ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? LEVEL_ORDER.info;

function write(level: Level, msg: string, args: unknown[]): void {
  if (LEVEL_ORDER[level] < threshold) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}`;
  const dest = level === 'debug' || level === 'info' ? console.log : level === 'warn' ? console.warn : console.error;
  if (args.length > 0) dest(line, ...args);
  else dest(line);
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => write('debug', msg, args),
  info: (msg: string, ...args: unknown[]) => write('info', msg, args),
  warn: (msg: string, ...args: unknown[]) => write('warn', msg, args),
  error: (msg: string, ...args: unknown[]) => write('error', msg, args),
};