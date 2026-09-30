import { describe, it, expect, vi, afterEach } from 'vitest'
import { vsimPesDepo } from './vsimPesDepo'

type Cagri = { url: string; method?: string; body?: unknown }
function sahteFetch(yanit: unknown, ok = true, status = 200) {
  const cagrilar: Cagri[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    cagrilar.push({ url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined })
    return { ok, status, json: async () => yanit } as Response
  }))
  return cagrilar
}
afterEach(() => vi.unstubAllGlobals())

describe('vsimPesDepo — PES API adaptörü', () => {
  it('listele: doğru adres, varsayılan sorgusu', async () => {
    const c = sahteFetch({ kayitlar: [{ id: 1, ad: 'A', varsayilan: true, atolye_adi: 'Şahinler' }] })
    const d = vsimPesDepo('atolye')
    const r = await d.listele('tesis', { varsayilan: true })
    expect(c[0].url).toBe('/api/pes/vsim/tesis?varsayilan=1')
    expect(r[0].sahip).toBeUndefined() // atölye kendi adını görmez
    await d.listele('urun-grubu')
    expect(c[1].url).toBe('/api/pes/vsim/urun-grubu')
  })

  it('merkez: yazamaz, kayıtlarda sahip = atölye adı', async () => {
    sahteFetch({ kayitlar: [{ id: 1, ad: 'A', varsayilan: false, atolye_adi: 'Şahinler' }] })
    const d = vsimPesDepo('merkez')
    expect(d.yazabilir).toBe(false)
    expect((await d.listele('tesis'))[0].sahip).toBe('Şahinler')
  })

  it('oluştur / güncelle / sil / getir: yöntem ve gövde', async () => {
    const c = sahteFetch({ kayit: { id: 7, ad: 'X', varsayilan: false } })
    const d = vsimPesDepo('atolye')
    expect(await d.olustur('tesis', { ad: 'X' })).toMatchObject({ id: 7 })
    await d.guncelle('urun-grubu', 7, { varsayilan: true })
    await d.sil('tesis', 7)
    await d.getir('tesis', 7)
    expect(c.map(x => `${x.method ?? 'GET'} ${x.url}`)).toEqual([
      'POST /api/pes/vsim/tesis', 'PUT /api/pes/vsim/urun-grubu/7', 'DELETE /api/pes/vsim/tesis/7', 'GET /api/pes/vsim/tesis/7',
    ])
    expect(c[1].body).toEqual({ varsayilan: true })
  })

  it('referans: tipler ve süreç adresi', async () => {
    const c = sahteFetch({ tipler: [{ id: 3, klasman_ad: 'Pantolon' }] })
    const d = vsimPesDepo('atolye')
    expect(await d.referans.tipler()).toEqual([{ id: 3, klasman_ad: 'Pantolon' }])
    await d.referans.surec(3, '0.5')
    expect(c[1].url).toBe('/api/pes/vsim/referans?urun_tipi_id=3&esik=0.5')
  })

  it('sunucu hatası mesajla fırlatılır', async () => {
    sahteFetch({ error: 'Merkez kayıt yazamaz' }, false, 403)
    await expect(vsimPesDepo('atolye').sil('tesis', 1)).rejects.toThrow('Merkez kayıt yazamaz')
  })
})
