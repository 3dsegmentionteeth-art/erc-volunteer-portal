import http from 'node:http';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const base = flag('base', 'http://localhost:4000').replace(/\/$/, '');
const path = flag('path', '');
const concurrency = parseInt(flag('concurrency', '12'), 10);
const durationMs = parseInt(flag('duration', '10000'), 10);
const quiet = has('quiet');

if (!path) {
  const usage = `usage: node load-test.mjs --path <api-path> [options]

options:
  --base <url>        API base (default http://localhost:4000)
  --path <api-path>   required, e.g. --path /api/verify/<ref>
  --concurrency <n>   concurrent connections (default 12)
  --duration <ms>     run length (default 10000)
  --quiet             output the summary as a single JSON line

Applies sustained concurrency from one IP, so rate limiters are expected to
engage: 429 responses are throttling working as designed, not failures. The
script only fails on 5xx or transport errors, signalling a genuine problem.`;
  console.error(usage);
  process.exit(2);
}

const started = Date.now();
const deadline = started + durationMs;
let open = 0;
let done = 0;
let networkErrors = 0;
const latencies = [];
const statusCounts = new Map();

const finish = () => {
  const elapsedMs = Date.now() - started;
  const sorted = latencies.slice().sort((a, b) => a - b);
  const pct = (q) => {
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((q / 100) * sorted.length));
    return Math.round(sorted[idx]);
  };
  const report = {
    base,
    path,
    durationMs: elapsedMs,
    concurrency,
    requests: done,
    rps: +(done / (elapsedMs / 1000)).toFixed(1),
    avgMs: Math.round(latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length)),
    p50Ms: pct(50),
    p90Ms: pct(90),
    p99Ms: pct(99),
    statuses: Object.fromEntries(statusCounts),
    networkErrors,
  };
  console.log(quiet ? JSON.stringify(report) : JSON.stringify(report, null, 2));
  const serverErrors = [...statusCounts.keys()].some((s) => typeof s === 'number' && s >= 500);
  if (networkErrors > 0 || serverErrors) process.exit(1);
  process.exit(0);
};

const fire = () => {
  if (Date.now() >= deadline) {
    open--;
    if (open === 0) finish();
    return;
  }
  open++;
  const start = process.hrtime();
  const req = http.get(`${base}${path}`, (res) => {
    res.resume();
    res.on('end', () => {
      const [s, ns] = process.hrtime(start);
      latencies.push(s * 1000 + ns / 1e6);
      statusCounts.set(res.statusCode, (statusCounts.get(res.statusCode) ?? 0) + 1);
      done++;
      open--;
      fire();
    });
  });
  req.on('timeout', () => req.destroy());
  req.on('error', () => {
    networkErrors++;
    done++;
    open--;
    fire();
  });
  req.setTimeout(30000);
};

for (let i = 0; i < concurrency; i++) fire();