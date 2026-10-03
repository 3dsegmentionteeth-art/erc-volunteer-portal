import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ProfileCheckKey, type ProfileCompletion, type UpdateVolunteerProfileInput, type VolunteerProfile } from '../api/client';
import { ApiError } from '../api/error';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Textarea } from '../components/Textarea';
import { TextField } from '../components/TextField';
import { apiErrorMessage } from '../lib/errorMessage';

type Loaded = { profile: VolunteerProfile; completion: ProfileCompletion };

interface FormState {
  englishName: string;
  arabicName: string;
  phone: string;
  idNumber: string;
  organization: string;
  educationInfo: string;
  skillsText: string;
  certificationsText: string;
}

function toForm(profile: VolunteerProfile): FormState {
  return {
    englishName: profile.englishName ?? '',
    arabicName: profile.arabicName ?? '',
    phone: profile.phone ?? '',
    idNumber: profile.idNumber ?? '',
    organization: profile.organization ?? '',
    educationInfo: profile.educationInfo ?? '',
    skillsText: profile.skills?.join('\n') ?? '',
    certificationsText: profile.certifications?.join('\n') ?? '',
  };
}

function tagsFromText(text: string): string[] {
  return [...new Set(text.split('\n').map((tag) => tag.trim()).filter(Boolean))];
}

/**
 * Phase 5 volunteer self-service profile: the read-only onboarding view plus
 * an edit mode for the fields a volunteer owns. Email and identity
 * verification status never come from here — they are server adjudications.
 */
export function VolunteerProfile() {
  const { t } = useTranslation();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await api.volunteerProfile();
      setData(loaded);
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, t));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = () => {
    if (!data) return;
    setError(null);
    setNotice(null);
    setForm(toForm(data.profile));
    setEditing(true);
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const input: UpdateVolunteerProfileInput = {
        englishName: form.englishName.trim(),
        arabicName: form.arabicName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        idNumber: form.idNumber.trim() || undefined,
        organization: form.organization.trim() || undefined,
        educationInfo: form.educationInfo.trim() || undefined,
        skills: tagsFromText(form.skillsText),
        certifications: tagsFromText(form.certificationsText),
      };
      const updated = await api.updateVolunteerProfile(input);
      setData(updated);
      setEditing(false);
      setNotice(t('profileSaved'));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errorUnexpected'));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <ErrorBanner>{loadError}</ErrorBanner>;
  if (!data) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-6">
        {notice ? <ErrorBanner tone="notice">{notice}</ErrorBanner> : null}
        {data.completion.percent < 100 ? <ErrorBanner tone="notice">{t('timeLockedNotice')}</ErrorBanner> : null}

        <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">{t('profileTitle')}</h2>
              <p className="mt-0.5 text-sm text-muted">{data.profile.code}</p>
            </div>
            {!editing ? (
              <Button size="sm" onClick={startEdit}>
                {t('profileEdit')}
              </Button>
            ) : null}
          </div>

          {editing && form ? (
            <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={t('profileEnglishName')} name="profileEnglishName" value={form.englishName} onChange={(v) => setField('englishName', v)} required />
                <TextField label={t('profileArabicName')} name="profileArabicName" value={form.arabicName} onChange={(v) => setField('arabicName', v)} />
                <TextField label={t('profilePhone')} name="profilePhone" value={form.phone} onChange={(v) => setField('phone', v)} />
                <TextField label={t('profileIdNumber')} name="profileIdNumber" value={form.idNumber} onChange={(v) => setField('idNumber', v)} />
                <TextField label={t('profileOrganization')} name="profileOrganization" value={form.organization} onChange={(v) => setField('organization', v)} />
                <div className="sm:col-span-2">
                  <TextField label={t('profileEducationInfo')} name="profileEducationInfo" value={form.educationInfo} onChange={(v) => setField('educationInfo', v)} />
                </div>
                <div className="sm:col-span-2">
                  <Textarea label={t('profileSkills')} name="profileSkills" value={form.skillsText} onChange={(v) => setField('skillsText', v)} rows={3} />
                  <p className="mt-1 text-xs text-muted">{t('profileTagsHint')}</p>
                </div>
                <div className="sm:col-span-2">
                  <Textarea label={t('profileCertifications')} name="profileCertifications" value={form.certificationsText} onChange={(v) => setField('certificationsText', v)} rows={3} />
                  <p className="mt-1 text-xs text-muted">{t('profileTagsHint')}</p>
                </div>
              </div>
              <p className="text-xs text-muted">{t('profileReadOnlyNote')}</p>
              {error ? <ErrorBanner>{error}</ErrorBanner> : null}
              <div className="flex justify-end gap-3">
                <Button variant="secondary" type="button" onClick={() => setEditing(false)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" busy={busy}>
                  {t('profileSave')}
                </Button>
              </div>
            </form>
          ) : (
            <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label={t('profileEnglishName')} value={data.profile.englishName} />
              <Field label={t('profileArabicName')} value={data.profile.arabicName} />
              <Field label={t('profilePhone')} value={data.profile.phone} />
              <Field label={t('profileIdNumber')} value={data.profile.idNumber} />
              <Field label={t('profileEmailAddress')} value={data.profile.email} />
              <Field label={t('profileOrganization')} value={data.profile.organization} />
              <Field label={t('profileEducationInfo')} value={data.profile.educationInfo} />
              <Field label={t('profileSkills')} value={data.profile.skills?.join(', ')} />
              <Field label={t('profileCertifications')} value={data.profile.certifications?.join(', ')} />
              <Field label={t('profileEmailStatus')} value={data.profile.emailVerified ? t('profileEmailVerified') : t('profileEmailPending')} />
              <Field
                label={t('profileIdentityStatus')}
                value={data.profile.identityVerified ? t('profileIdentityVerified') : t('profileIdentityPending')}
              />
            </dl>
          )}
        </section>
      </section>

      <CompletionCard completion={data.completion} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value && value.length > 0 ? value : '–'}</dd>
    </div>
  );
}

const CHECK_LABELS: Record<ProfileCheckKey, string> = {
  englishName: 'profileEnglishName',
  arabicName: 'profileArabicName',
  idNumber: 'profileIdNumber',
  organization: 'profileOrganization',
  skills: 'profileSkills',
  certifications: 'profileCertifications',
  educationInfo: 'profileEducationInfo',
  applicationAnswers: 'registerQuestionWhy',
  emailVerified: 'profileEmailStatus',
  identityVerified: 'profileIdentityStatus',
};

function CompletionCard({ completion }: { completion: ProfileCompletion }) {
  const { t } = useTranslation();
  const checks = useMemo(() => Object.entries(completion.checks) as [ProfileCheckKey, boolean][], [completion]);

  return (
    <aside className="h-fit rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-ink">{t('completionTitle')}</h3>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-3xl font-bold text-ink">{completion.percent}%</span>
        <span className="text-sm text-muted">
          {t('completionPassed')}: {completion.passed}/{completion.total}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={completion.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${completion.percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">{t('completionHint')}</p>
      <ul className="mt-4 space-y-1.5">
        {checks.map(([key, passed]) => (
          <li key={key} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={passed ? 'text-emerald-600' : 'text-ink/25'}
            >
              {passed ? '✓' : '○'}
            </span>
            <span className={passed ? 'text-ink' : 'text-muted'}>{t(CHECK_LABELS[key])}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}