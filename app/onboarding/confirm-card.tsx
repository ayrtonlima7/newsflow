'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveProfile } from './actions';
import { useT, useLocale } from '../_i18n/provider';
import { contextoLabel, frequenciaLabel } from '@/src/lib/onboarding-options';
import { track } from '@/src/lib/analytics/track';
import { ANALYTICS_EVENTS } from '@/src/lib/analytics/events';
import type { Profile } from '@/src/lib/types';

export function ConfirmCard({
  profile,
  onEdit,
}: {
  profile: Profile;
  onEdit: () => void;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    // Fundo do onboarding — dispara ANTES do save (que redireciona em caso de
    // sucesso e não retorna).
    track(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      frequencia: profile.frequencia || '',
      n_topicos: profile.topicos.length,
    });
    const result = await saveProfile(profile);
    if (result && !result.ok) {
      setError(result.error ?? 'erro ao salvar');
      setSaving(false);
    }
    // sucesso → server action redireciona via Next.js, não retorna
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {profile.nome ? t('confirm.titleNamed', { nome: profile.nome }) : t('confirm.title')}
        </h2>
        <p className="text-sm text-[var(--color-muted)]">{t('confirm.subtitle')}</p>
      </div>

      <dl className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm">
        <Row label={t('confirm.name')}>{profile.nome || <Empty />}</Row>
        <Row label={t('confirm.theme')}>
          <ChipList items={profile.tema} />
        </Row>
        <Row label={t('confirm.context')}>
          {profile.contexto.length ? (
            <ChipList items={profile.contexto.map((c) => contextoLabel(c, locale))} />
          ) : (
            <Empty />
          )}
        </Row>
        {profile.descricao_livre && (
          <Row label={t('confirm.about')}>{profile.descricao_livre}</Row>
        )}
        <Row label={t('confirm.goal')}>
          {profile.objetivo.length ? <ChipList items={profile.objetivo} /> : <Empty />}
        </Row>
        <Row label={t('confirm.topics')}>
          <ChipList items={profile.topicos} />
        </Row>
        {profile.referencias.length > 0 && (
          <Row label={t('confirm.refs')}>
            <ChipList items={profile.referencias} />
          </Row>
        )}
        <Row label={t('confirm.formats')}>
          <ChipList items={profile.formatos} />
        </Row>
        {profile.ignorar.length > 0 && (
          <Row label={t('confirm.ignore')}>
            <ChipList items={profile.ignorar} muted />
          </Row>
        )}
        <Row label={t('confirm.frequency')}>
          {profile.frequencia ? frequenciaLabel(profile.frequencia, locale) : <Empty />}
        </Row>
      </dl>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-[var(--color-accent-fg)] transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t('confirm.saving') : t('confirm.confirm')}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 text-sm font-medium transition hover:border-[var(--color-fg)] disabled:opacity-50"
        >
          {t('confirm.backEdit')}
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Empty() {
  return <span className="text-[var(--color-muted)] font-normal">—</span>;
}

function ChipList({ items, muted }: { items: string[]; muted?: boolean }) {
  if (!items || items.length === 0) return <Empty />;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={
            muted
              ? 'rounded-full bg-[var(--color-surface-2)] px-3 py-0.5 text-xs text-[var(--color-muted)] font-normal'
              : 'rounded-full bg-[var(--color-surface-2)] px-3 py-0.5 text-xs font-normal'
          }
        >
          {item}
        </span>
      ))}
    </div>
  );
}
