/* PES deposu — VSIM çekirdeğinin kayıt sözleşmesini (components/vsim/depo/sozlesme.js)
   PES API'sine bağlar: /api/pes/vsim/{tesis,urun-grubu,referans}. Kiracı ve RLS
   sunucuda (lib/pes/vsim-kayit.ts). Çekirdek bu dosyayı bilmez; VsimEmbed verir. */

type Tur = 'tesis' | 'urun-grubu'
type Kayit = { id: number; ad: string; varsayilan: boolean; atolye_adi?: string; sahip?: string; [k: string]: unknown }

const API = '/api/pes/vsim'

async function api(path: string, opts: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method,
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `İstek başarısız (${res.status})`)
  return json
}

/* kapsam: 'atolye' = kendi kayıtlarını yazar; 'merkez' = tüm atölyeleri görür, yazamaz
   (yazma yasağı sunucuda da var — burası yalnız arayüzü gizler). */
export function vsimPesDepo(kapsam: 'atolye' | 'merkez') {
  const merkez = kapsam === 'merkez'
  // Merkezde kaydın hangi atölyeye ait olduğu gösterilir; atölye kendi adını görmez.
  const sahipli = (k: Kayit): Kayit => (merkez && k.atolye_adi ? { ...k, sahip: k.atolye_adi } : k)

  return {
    yazabilir: !merkez,
    async listele(tur: Tur, q: { varsayilan?: boolean } = {}) {
      const { kayitlar } = await api(`/${tur}${q.varsayilan ? '?varsayilan=1' : ''}`)
      return ((kayitlar || []) as Kayit[]).map(sahipli)
    },
    async getir(tur: Tur, id: number) {
      const { kayit } = await api(`/${tur}/${id}`)
      return sahipli(kayit)
    },
    async olustur(tur: Tur, govde: object) {
      const { kayit } = await api(`/${tur}`, { method: 'POST', body: govde })
      return kayit as { id: number }
    },
    async guncelle(tur: Tur, id: number, govde: object) {
      const { kayit } = await api(`/${tur}/${id}`, { method: 'PUT', body: govde })
      return kayit as { id: number }
    },
    async sil(tur: Tur, id: number) {
      await api(`/${tur}/${id}`, { method: 'DELETE' })
    },
    referans: {
      ad: 'PES MTM',
      async tipler() {
        const r = await api('/referans')
        return r.tipler || []
      },
      surec: (tipId: number | string, esik: string) =>
        api(`/referans?urun_tipi_id=${encodeURIComponent(String(tipId))}&esik=${encodeURIComponent(esik)}`),
    },
  }
}
