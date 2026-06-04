'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveProfile } from './actions';
import type { Profile } from '@/src/lib/types';

export function ConfirmCard({
  profile,
  onEdit,
}: {
  profile: Profile;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
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
          {profile.nome ? `Tudo certo, ${profile.nome}?` : 'Tudo certo?'}
        </h2>
        <p className="text-sm text-[var(--color-muted)]">
          Confere se está tudo como você quer. Pode editar a qualquer momento depois.
        </p>
      </div>

      <dl className="space-y-4 rounded-lg border border-[var(--color-border)] bg-white p-6 text-sm">
        <Row label="Nome">{profile.nome || <Empty />}</Row>
        <Row label="Tema(s)">
          <ChipList items={profile.tema} />
        </Row>
        <Row label="Contexto">{profile.contexto || <Empty />}</Row>
        {profile.descricao_livre && (
          <Row label="Sobre você">{profile.descricao_livre}</Row>
        )}
        <Row label="Objetivo">{profile.objetivo || <Empty />}</Row>
        <Row label="Tópicos">
          <ChipList items={profile.topicos} />
        </Row>
        {profile.referencias.length > 0 && (
          <Row label="Referências">
            <ChipList items={profile.referencias} />
          </Row>
        )}
        <Row label="Formatos">
          <ChipList items={profile.formatos} />
        </Row>
        {profile.ignorar.length > 0 && (
          <Row label="Ignorar">
            <ChipList items={profile.ignorar} muted />
          </Row>
        )}
        <Row label="Frequência">{profile.frequencia || <Empty />}</Row>
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
          {saving ? 'Salvando…' : 'Confirmar e salvar'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-white px-6 py-3 text-sm font-medium transition hover:border-[var(--color-fg)] disabled:opacity-50"
        >
          Voltar e editar
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
              ? 'rounded-full bg-stone-100 px-3 py-0.5 text-xs text-[var(--color-muted)] font-normal'
              : 'rounded-full bg-stone-100 px-3 py-0.5 text-xs font-normal'
          }
        >
          {item}
        </span>
      ))}
    </div>
  );
}
