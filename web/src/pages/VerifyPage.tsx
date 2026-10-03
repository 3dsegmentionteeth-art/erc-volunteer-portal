import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type VerificationResult } from '../api/client';
import { ApiError } from '../api/error';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { TextField } from '../components/TextField';
import { apiErrorMessage } from '../lib/errorMessage';
import { formatMinutes } from '../lib/formatMinutes';

type CheckState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'valid'; result: VerificationResult }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string };

/**
 * Phase 6 public verification page (no auth). `/verify/:ref` immediately
 * checks the reference; both unknown and revoked references resolve to the
 * same "not found" outcome — the page never distinguishes them.
 */
export function VerifyPage() {
  const { t } = useTranslation();
  const { ref: routeRef } = useParams<{ ref: string }>();
  const navigate = useNavigate();
  const [input, setInput] = useState(routeRef ?? '');
  const [state, setState] = useState<CheckState>({ kind: 'idle' });

  useEffect(() => {
    const ref = routeRef?.trim();
    if (!ref) {
      setState({ kind: 'idle' });
      return;
    }
    let alive = true;
    setState({ kind: 'loading' });
    api
      .verifyRef(ref)
      .then((result) => {
        if (alive) setState({ kind: 'valid', result });
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ kind: 'invalid' });
        } else {
          setState({ kind: 'error', message: apiErrorMessage(err, t) });
        }
      });
    return () => {
      alive = false;
    };
  }, [routeRef, t]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ref = input.trim();
    if (ref) navigate(`/verify/${ref}`);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-10 border-b border-ink/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <BrandMark className="size-9" />
            <div className="leading-tight">
              <div className="font-semibold text-ink">ERC</div>
              <div className="text-xs text-muted">{t('portal')}</div>
            </div>
          </div>
          <LanguageSwitch />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold text-ink">{t('verifyTitle')}</h1>
        <p className="mt-1 text-sm text-muted">{t('verifyHint')}</p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextField label={t('verifyRefLabel')} name="verifyRef" value={input} onChange={setInput} dir="ltr" />
          </div>
          <Button type="submit" disabled={!input.trim()}>
            {t('verifyCheck')}
          </Button>
        </form>

        <div className="mt-8">{renderState(state, t)}</div>
      </main>

      <footer className="border-t border-ink/10 py-4">
        <div className="mx-auto max-w-2xl px-4 text-xs text-muted">{t('brand')}</div>
      </footer>
    </div>
  );
}

function renderState(state: CheckState, t: (key: string) => string) {
  switch (state.kind) {
    case 'loading':
      return (
        <div className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-muted shadow-sm">{t('verifyLoading')}</div>
      );
    case 'invalid':
      return (
        <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <span className="inline-block rounded-full bg-crimson/10 px-3 py-1 text-xs font-medium text-crimson-dark">
            {t('verifyBadgeInvalid')}
          </span>
          <p className="mt-3 text-sm text-ink">{t('verifyNotValidBody')}</p>
        </div>
      );
    case 'error':
      return <ErrorBanner>{state.message}</ErrorBanner>;
    case 'valid':
      return <ResultCard result={state.result} />;
    default:
      return null;
  }
}

function ResultCard({ result }: { result: VerificationResult }) {
  const { t } = useTranslation();
  const totalLabel = formatMinutes(result.report.approvedTotalMinutes, t);

  return (
    <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-4">
        <div>
          <span className="inline-block rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-medium text-emerald-700">
            {t('verifyBadgeValid')}
          </span>
          <h2 className="mt-2 text-lg font-semibold text-ink">{t('verifyScopeLabel')}</h2>
        </div>
      </div>
      <dl className="grid gap-4 px-5 py-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{t('volunteer')}</dt>
          <dd className="mt-0.5 text-ink">
            <span className="font-semibold">{result.volunteer.englishName}</span>
            {result.volunteer.arabicName ? <span className="ml-2 text-muted">{result.volunteer.arabicName}</span> : null}
            <span className="ml-2 text-muted">({result.volunteer.code})</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{t('reportTotal')}</dt>
          <dd className="mt-0.5 font-semibold text-ink">{totalLabel}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{t('verifyRecordsCount')}</dt>
          <dd className="mt-0.5 text-ink">{result.report.recordCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{t('verifyServiceDays')}</dt>
          <dd className="mt-0.5 text-ink">{result.report.serviceDayCount}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-muted">{t('verifyIssuedAt')}</dt>
          <dd className="mt-0.5 text-ink">{new Date(result.reference.issuedAt).toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  );
}