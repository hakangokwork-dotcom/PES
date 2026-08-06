'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import YetenekEditoru from '@/components/pes/YetenekEditoru'
import AtolyeProfilSekmesi, {
  type ProfilKaydi, type DenetimKaydi,
} from '@/components/pes/AtolyeProfilSekmesi'

type Account = {
  workshop_id: number
  legal_name: string | null
  tax_no: string | null
  founded_date: string | null
  relationship_start: string | null
  production_area_m2: number | null
  building_ownership: string | null
  incentive_zone: number | null
  address_full: string | null
  notes: string | null
}

type Contact = {
  id: number
  name: string
  role: string | null
  phone: string | null
  email: string | null
  is_primary: boolean
}

type Share = {
  id: number
  customer_label: string
  share_pct: string | number | null
  valid_from: string
  valid_to: string | null
}

type Interaction = {
  id: number
  kind: string
  occurred_at: string
  summary: string
}

type Capability = {
  dimension_code: string
  dimension_label: string | null
  value_code: string
  value_label: string | null
  line_count: number
}

/* Yetenek editörü bant bazlı çalışır; sekme atölyenin bantlarını listeler. */
type Line = { id: number; code: string; name: string }

const TABS = ['Kimlik', 'Profil & Denetim', 'Yetenek', 'İlişki', 'Zaman Çizgisi'] as const
type Tab = (typeof TABS)[number]

const KIND_LABELS: Record<string, string> = {
  ziyaret: 'Ziyaret',
  denetim: 'Denetim',
  olay: 'Olay',
  dmaic: 'DMAIC',
  fiyat_revizyonu: 'Fiyat Revizyonu',
  not: 'Not',
}

const KIND_STYLES: Record<string, string> = {
  ziyaret: 'bg-canvas text-muted',
  denetim: 'bg-canvas text-muted',
  olay: 'bg-red-100 text-red-700',
  dmaic: 'bg-amber-100 text-amber-700',
  fiyat_revizyonu: 'bg-emerald-100 text-emerald-700',
  not: 'bg-canvas text-muted',
}

function yearsSince(dateStr: string | null): string | null {
  if (!dateStr) return null
  const start = new Date(dateStr)
  if (Number.isNaN(start.getTime())) return null
  const years = (Date.now() - start.getTime()) / (365.25 * 24 * 3600 * 1000)
  return years < 1 ? `${Math.round(years * 12)} ay` : `${years.toFixed(1)} yıl`
}

export default function WorkshopTabs({
  workshopId,
  account,
  contacts,
  shares,
  interactions,
  capabilities,
  lines,
  isActive,
  profil,
  denetimler,
}: {
  workshopId: number
  account: Account | null
  contacts: Contact[]
  shares: Share[]
  interactions: Interaction[]
  capabilities: Capability[]
  lines: Line[]
  isActive: boolean
  profil: ProfilKaydi
  denetimler: DenetimKaydi[]
}) {
  const [tab, setTab] = useState<Tab>('Kimlik')

  return (
    <div>
      <div className="border-b border-line-soft flex gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-faint hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="pt-6">
        {tab === 'Kimlik' && <KimlikTab workshopId={workshopId} account={account} />}
        {tab === 'Profil & Denetim' && (
          <AtolyeProfilSekmesi
            workshopId={workshopId}
            isActive={isActive}
            profil={profil}
            denetimler={denetimler}
          />
        )}
        {tab === 'Yetenek' && <YetenekTab capabilities={capabilities} lines={lines} />}
        {tab === 'İlişki' && (
          <IliskiTab workshopId={workshopId} account={account} contacts={contacts} shares={shares} />
        )}
        {tab === 'Zaman Çizgisi' && (
          <ZamanCizgisiTab workshopId={workshopId} interactions={interactions} />
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Kimlik */

function KimlikTab({ workshopId, account }: { workshopId: number; account: Account | null }) {
  const router = useRouter()
  const [form, setForm] = useState<Partial<Account>>(account ?? {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/pes/workshops/${workshopId}/account`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Kaydedilemedi')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const set = (k: keyof Account) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v === '' ? null : v }))

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Ticari Ünvan" value={form.legal_name ?? ''} onChange={set('legal_name')} />
        <Field label="Vergi No" value={form.tax_no ?? ''} onChange={set('tax_no')} />
        <Field label="Kuruluş Tarihi" type="date" value={form.founded_date?.slice(0, 10) ?? ''} onChange={set('founded_date')} />
        <Field
          label="İlişki Başlangıcı"
          type="date"
          value={form.relationship_start?.slice(0, 10) ?? ''}
          onChange={set('relationship_start')}
          hint={yearsSince(form.relationship_start ?? null) ?? undefined}
        />
        <Field
          label="Üretim Alanı (m²)"
          type="number"
          value={form.production_area_m2?.toString() ?? ''}
          onChange={set('production_area_m2')}
        />
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Bina Durumu</label>
          <select
            value={form.building_ownership ?? ''}
            onChange={(e) => set('building_ownership')(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none"
          >
            <option value="">—</option>
            <option value="kira">Kira</option>
            <option value="mulk">Mülk</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Teşvik Bölgesi</label>
          <select
            value={form.incentive_zone?.toString() ?? ''}
            onChange={(e) => set('incentive_zone')(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none"
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6].map((z) => (
              <option key={z} value={z}>{z}. Bölge</option>
            ))}
          </select>
        </div>
      </div>

      <Field label="Adres" value={form.address_full ?? ''} onChange={set('address_full')} textarea />
      <Field label="Notlar" value={form.notes ?? ''} onChange={set('notes')} textarea />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium disabled:opacity-50"
      >
        {saving ? 'Kaydediliyor…' : 'Kaydet'}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------ Yetkinlik */

/* Atölye geneli özet (salt okunur) + seçilen bandın düzenlenebilir profili.
   İkisi farklı soruya cevap verir: özet "bu atölye ne yapar", editör
   "bu BANT ne yapar". Yetenek bantta tutulur, özet ondan türetilir. */
function YetenekTab({ capabilities, lines }: { capabilities: Capability[]; lines: Line[] }) {
  const [seciliBant, setSeciliBant] = useState<number | null>(lines[0]?.id ?? null)

  const byDimension = capabilities.reduce<Record<string, Capability[]>>((acc, c) => {
    const key = c.dimension_label ?? c.dimension_code
    ;(acc[key] ??= []).push(c)
    return acc
  }, {})

  const bant = lines.find((l) => l.id === seciliBant)

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Atölye Özeti</h3>
          <p className="text-xs text-faint mt-0.5">
            Bantlardan türetilir — bir yetenek kaç bantta varsa o sayıyla görünür.
          </p>
        </div>
        {capabilities.length === 0 ? (
          <p className="text-sm text-faint">
            Bu atölyenin bantlarında henüz yetenek işaretlenmemiş. Aşağıdan başlayabilirsin.
          </p>
        ) : (
          Object.entries(byDimension).map(([dimension, values]) => (
            <div key={dimension}>
              <h4 className="text-xs font-semibold text-body mb-1.5">{dimension}</h4>
              <div className="flex flex-wrap gap-2">
                {values.map((v) => (
                  <span
                    key={`${v.dimension_code}-${v.value_code}`}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-canvas text-body"
                  >
                    {v.value_label ?? v.value_code}
                    <span className="text-faint">{v.line_count} bant</span>
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="border-t border-line-soft pt-6">
        {lines.length === 0 ? (
          <p className="text-sm text-faint">
            Bu atölyede aktif bant yok. Yetenek girmek için önce bant eklenmeli.
          </p>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-ink mb-3">Bant Bazında Düzenle</h3>
            <div className="flex flex-wrap gap-2 mb-5">
              {lines.map((l) => {
                const aktif = l.id === seciliBant
                return (
                  <button
                    key={l.id}
                    onClick={() => setSeciliBant(l.id)}
                    className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                      aktif
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white text-body border-line-soft hover:border-accent'
                    }`}
                  >
                    {l.name}
                  </button>
                )
              })}
            </div>
            {bant && <YetenekEditoru key={bant.id} lineId={bant.id} lineAdi={bant.name} />}
          </>
        )}
      </section>
    </div>
  )
}

/* --------------------------------------------------------------- İlişki */

function IliskiTab({
  workshopId,
  account,
  contacts,
  shares,
}: {
  workshopId: number
  account: Account | null
  contacts: Contact[]
  shares: Share[]
}) {
  const router = useRouter()
  const [newShare, setNewShare] = useState({ customer_label: '', share_pct: '' })
  const [newContact, setNewContact] = useState({ name: '', role: '', phone: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const totalPct = shares.reduce((sum, s) => sum + Number(s.share_pct ?? 0), 0)
  const relAge = yearsSince(account?.relationship_start ?? null)

  async function post(url: string, body: unknown, reset: () => void) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Eklenemedi')
      reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      {relAge && (
        <div className="bg-white border border-line-soft rounded-xl p-4 inline-block">
          <p className="text-xs text-faint">İlişki Yaşı</p>
          <p className="text-xl font-bold text-ink">{relAge}</p>
        </div>
      )}

      {/* Müşteri payları */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink">Müşteri Kapasite Paylaşımı</h3>
          <span className={`text-xs ${totalPct > 100 ? 'text-red-600 font-medium' : 'text-faint'}`}>
            Toplam %{totalPct.toFixed(1)}
            {totalPct > 100 && ' — %100ü aşıyor'}
          </span>
        </div>

        {shares.length === 0 ? (
          <p className="text-sm text-faint mb-3">Kayıt yok.</p>
        ) : (
          <div className="space-y-1.5 mb-3">
            {shares.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="text-sm text-body w-40 truncate">{s.customer_label}</span>
                <div className="flex-1 h-2 bg-canvas rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{ width: `${Math.min(Number(s.share_pct ?? 0), 100)}%` }}
                  />
                </div>
                <span className="text-sm text-muted w-14 text-right">
                  %{Number(s.share_pct ?? 0).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            placeholder="Müşteri etiketi"
            value={newShare.customer_label}
            onChange={(e) => setNewShare((s) => ({ ...s, customer_label: e.target.value }))}
            className="flex-1 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            placeholder="%"
            type="number"
            value={newShare.share_pct}
            onChange={(e) => setNewShare((s) => ({ ...s, share_pct: e.target.value }))}
            className="w-24 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            disabled={busy || !newShare.customer_label.trim()}
            onClick={() =>
              post(
                `/api/pes/workshops/${workshopId}/customer-shares`,
                { customer_label: newShare.customer_label, share_pct: newShare.share_pct || null },
                () => setNewShare({ customer_label: '', share_pct: '' }),
              )
            }
            className="px-3 py-2 border border-line rounded-lg text-sm hover:bg-canvas disabled:opacity-50"
          >
            Ekle
          </button>
        </div>
        <p className="text-xs text-faint mt-1.5">
          Aynı müşteri tekrar eklenirse önceki kayıt kapatılır, geçmiş silinmez.
        </p>
      </section>

      {/* İletişim kişileri */}
      <section>
        <h3 className="text-sm font-semibold text-ink mb-3">İletişim Kişileri</h3>
        {contacts.length === 0 ? (
          <p className="text-sm text-faint mb-3">Kayıt yok.</p>
        ) : (
          <div className="space-y-2 mb-3">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-sm">
                <span className="font-medium text-ink">{c.name}</span>
                {c.is_primary && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Birincil</span>
                )}
                <span className="text-faint">{c.role}</span>
                <span className="text-faint ml-auto">{c.phone} {c.email}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-4 gap-2">
          <input
            placeholder="İsim"
            value={newContact.name}
            onChange={(e) => setNewContact((c) => ({ ...c, name: e.target.value }))}
            className="border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            placeholder="Görev"
            value={newContact.role}
            onChange={(e) => setNewContact((c) => ({ ...c, role: e.target.value }))}
            className="border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            placeholder="Telefon"
            value={newContact.phone}
            onChange={(e) => setNewContact((c) => ({ ...c, phone: e.target.value }))}
            className="border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <input
              placeholder="E-posta"
              value={newContact.email}
              onChange={(e) => setNewContact((c) => ({ ...c, email: e.target.value }))}
              className="flex-1 min-w-0 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              disabled={busy || !newContact.name.trim()}
              onClick={() =>
                post(
                  `/api/pes/workshops/${workshopId}/contacts`,
                  { ...newContact, is_primary: contacts.length === 0 },
                  () => setNewContact({ name: '', role: '', phone: '', email: '' }),
                )
              }
              className="px-3 py-2 border border-line rounded-lg text-sm hover:bg-canvas disabled:opacity-50"
            >
              Ekle
            </button>
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

/* ------------------------------------------------------- Zaman Çizgisi */

function ZamanCizgisiTab({
  workshopId,
  interactions,
}: {
  workshopId: number
  interactions: Interaction[]
}) {
  const router = useRouter()
  const [form, setForm] = useState({ kind: 'ziyaret', summary: '', occurred_at: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/pes/workshops/${workshopId}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: form.kind,
          summary: form.summary,
          occurred_at: form.occurred_at || undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Eklenemedi')
      setForm({ kind: 'ziyaret', summary: '', occurred_at: '' })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-start">
        <select
          value={form.kind}
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
          className="border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <input
          type="date"
          value={form.occurred_at}
          onChange={(e) => setForm((f) => ({ ...f, occurred_at: e.target.value }))}
          className="border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          placeholder="Özet"
          value={form.summary}
          onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
          className="flex-1 min-w-[200px] border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={add}
          disabled={busy || !form.summary.trim()}
          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium disabled:opacity-50"
        >
          Ekle
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {interactions.length === 0 ? (
        <p className="text-sm text-faint">Henüz kayıt yok.</p>
      ) : (
        <ol className="relative border-l border-line-soft ml-2 space-y-5">
          {interactions.map((it) => (
            <li key={it.id} className="ml-5">
              <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-line" />
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${KIND_STYLES[it.kind] ?? KIND_STYLES.not}`}>
                  {KIND_LABELS[it.kind] ?? it.kind}
                </span>
                <time className="text-xs text-faint">
                  {new Date(it.occurred_at).toLocaleDateString('tr-TR')}
                </time>
              </div>
              <p className="text-sm text-body mt-1">{it.summary}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- ortak */

function Field({
  label,
  value,
  onChange,
  type = 'text',
  textarea = false,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  textarea?: boolean
  hint?: string
}) {
  const cls =
    'w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none'
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1.5">
        {label}
        {hint && <span className="ml-2 text-faint font-normal">{hint}</span>}
      </label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={cls} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </div>
  )
}
