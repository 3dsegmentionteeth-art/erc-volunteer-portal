import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/error';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { TextField } from '../components/TextField';
import { cn } from '../lib/cn';

type Mode = 'volunteer' | 'admin';

function resolveLoginError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t('loginGenericError');
    switch (err.code) {
      case 'LOGIN_RATE_LIMITED':
        return t('loginRateLimited');
      case 'NETWORK_ERROR':
        return t('errorNetwork');
      case 'CSRF_TOKEN_INVALID':
        return t('errorCsrf');
    }
  }
  return t('errorUnexpected');
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('volunteer');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(resolveLoginError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-gradient-to-br from-crimson via-crimson-dark to-crimson-deep p-8 text-white lg:p-12">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10" />
          <div>
            <div className="text-lg font-semibold leading-tight">ERC</div>
            <div className="text-sm text-white/70">{t('portal')}</div>
          </div>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{t('brand')}</h1>
          <p className="mt-3 text-white/85">{t('loginSubtitle')}</p>
          <p className="mt-6 inline-block rounded-lg bg-white/10 px-3 py-2 text-sm text-white/90">
            {t('shellMadeOfficialNotice')}
          </p>
        </div>
        <p className="text-xs text-white/60">© {new Date().getFullYear()} ERC</p>
      </section>

      <section className="flex flex-col items-center justify-center bg-canvas px-4 py-10">
        <div className="mb-6 self-end">
          <LanguageSwitch />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <BrandMark className="size-9" />
            <span className="text-lg font-semibold text-ink">{t('brand')}</span>
          </div>
          <h2 className="text-2xl font-bold text-ink">{t('loginTitle')}</h2>

          <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-ink/5 p-1">
            {(['volunteer', 'admin'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  mode === m ? 'bg-white text-crimson shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {m === 'volunteer' ? t('volunteer') : t('admin')}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate={false}>
            <TextField
              label={mode === 'admin' ? t('loginIdentifierAdmin') : t('loginIdentifierVolunteer')}
              name="identifier"
              value={identifier}
              onChange={setIdentifier}
              placeholder={mode === 'admin' ? 'admin' : 'ERC-1001'}
              autoComplete="username"
              required
            />
            <TextField
              label={t('loginPassword')}
              name="password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
              minLength={8}
            />

            {error ? <ErrorBanner>{error}</ErrorBanner> : null}

            <Button type="submit" size="lg" busy={busy} className="w-full">
              {t('login')}
            </Button>
          </form>

          <div className="mt-5 space-y-2 text-sm">
            <p className="text-muted">
              {mode === 'admin' ? t('loginFootAdmin') : t('loginFootVolunteer')}
            </p>
            <p>
              <span className="text-muted">{t('register')}: </span>
              <Link to="/register" className="font-medium text-crimson hover:underline">
                {t('register')}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}