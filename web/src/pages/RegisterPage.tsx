import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Branch } from '../api/client';
import { api } from '../api/client';
import { ApiError } from '../api/error';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { apiErrorMessage } from '../lib/errorMessage';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterPage() {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesError, setBranchesError] = useState(false);

  const [branchId, setBranchId] = useState('');
  const [englishName, setEnglishName] = useState('');
  const [arabicName, setArabicName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [answerWhy, setAnswerWhy] = useState('');
  const [answerBenefit, setAnswerBenefit] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .branches()
      .then((items) => {
        if (!cancelled) setBranches(items);
      })
      .catch(() => {
        if (!cancelled) setBranchesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!branchId) {
      setError(t('registerRequiredField'));
      return;
    }
    if (password.length < 8) {
      setError(t('registerPassword'));
      return;
    }
    if (password !== confirm) {
      setError(t('registerPasswordMismatch'));
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError(t('errorValidation'));
      return;
    }
    if (busy) return;

    setBusy(true);
    try {
      // Empties omitted so a partially-filled form still submits cleanly.
      const answers = [
        { key: 'why', answer: answerWhy.trim() },
        { key: 'benefit', answer: answerBenefit.trim() },
      ].filter((a) => a.answer.length > 0);
      await api.registerVolunteer({
        branchId,
        englishName: englishName.trim(),
        arabicName: arabicName.trim() || undefined,
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        password,
        organization: organization.trim() || undefined,
        applicationAnswers: answers.length > 0 ? answers : undefined,
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_ALREADY_REGISTERED') {
        setError(t('errorEmailAlreadyRegistered'));
      } else {
        setError(apiErrorMessage(err, t));
      }
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <BrandMark className="mx-auto size-12" />
          <h1 className="mt-4 text-2xl font-bold text-ink">{t('registerSubmittedTitle')}</h1>
          <p className="mt-2 text-muted">{t('registerSubmittedBody')}</p>
          <div className="mt-6">
            <Link to="/login" className="font-medium text-crimson hover:underline">
              {t('registerBackToLogin')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas px-4 py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark className="size-10" />
            <div>
              <div className="font-semibold text-ink">ERC</div>
              <div className="text-sm text-muted">{t('portal')}</div>
            </div>
          </div>
          <LanguageSwitch />
        </header>

        <main className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-ink">{t('registerTitle')}</h1>
          <p className="mt-1 text-muted">{t('registerSubtitle')}</p>

          <form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('registerBranch')}
              name="branch"
              required
              value={branchId}
              onChange={setBranchId}
              placeholder={branchesError ? t('errorNetwork') : t('registerBranchPlaceholder')}
              options={branches.map((b) => ({ value: b.id, label: `${b.nameEn} (${b.code})` }))}
            />
            <div className="sm:col-span-2">
              <TextField
                label={t('registerEnglishName')}
                name="englishName"
                value={englishName}
                onChange={setEnglishName}
                autoComplete="name"
                required
              />
            </div>
            <TextField
              label={t('registerArabicName')}
              name="arabicName"
              dir="rtl"
              value={arabicName}
              onChange={setArabicName}
            />
            <TextField
              label={t('registerPhone')}
              name="phone"
              type="tel"
              value={phone}
              onChange={setPhone}
              autoComplete="tel"
              required
            />
            <TextField
              label={t('registerEmail')}
              name="email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />
            <TextField
              label={t('registerOrganization')}
              name="organization"
              value={organization}
              onChange={setOrganization}
              autoComplete="organization"
            />
            <div className="sm:col-span-2">
              <TextField
                label={t('registerQuestionWhy')}
                name="answerWhy"
                value={answerWhy}
                onChange={setAnswerWhy}
              />
            </div>
            <div className="sm:col-span-2">
              <TextField
                label={t('registerQuestionBenefit')}
                name="answerBenefit"
                value={answerBenefit}
                onChange={setAnswerBenefit}
              />
            </div>
            <TextField
              label={t('registerPassword')}
              name="password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              required
              minLength={8}
            />
            <TextField
              label={t('registerConfirmPassword')}
              name="confirm"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              required
              minLength={8}
            />

            {error ? <div className="sm:col-span-2"><ErrorBanner>{error}</ErrorBanner></div> : null}

            <div className="flex items-center gap-4 sm:col-span-2">
              <Button type="submit" size="lg" busy={busy}>
                {t('submit')}
              </Button>
              <Link to="/login" className="text-sm font-medium text-muted hover:text-crimson">
                {t('registerBackToLogin')}
              </Link>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}