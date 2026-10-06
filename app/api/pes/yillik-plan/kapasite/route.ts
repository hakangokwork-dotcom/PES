import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { adetGecerli } from '@/lib/pes/yillik-plan'
import { atolyeyseReddet } from '../_yetki'
import { atolyeTenant, govdeOku, hata, idCoz } from '../_dogrula'

/**
 * Atölyenin baz aylık kapasitesi → workshop_profil.aylik_kapasite.
 *   PUT { workshopId, aylikKapasite: number | null }   null/0 → baz kaldırılır
 *
 * Profil satırı yoksa OLUŞTURULUR (eslesme_yontemi 'elle') —
 * /api/pes/atolye-profil/[id] PATCH ile aynı yol. Değer boşken yeni satır
 * açılmaz: boş profil satırı atölye-profil ekranındaki "profilli" sayısını
 * yanlış artırırdı.
 *
 * DİKKAT: scripts/import_atolye_profil.mjs ve eslestirme_uygula.mjs
 * aylik_kapasite'yi Excel'den ezer; ekranda bu not gösteriliyor.
 */
export const PUT = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const b = await govdeOku(req)
  if (!b) return hata('Gövde JSON nesnesi olmalı')
  const workshopId = idCoz(b.workshopId)
  if (workshopId === null) return hata('workshopId zorunlu')
  if (!('aylikKapasite' in b)) return hata('aylikKapasite zorunlu (silmek için null)')
  const ham = b.aylikKapasite ?? null
  const temiz = ham === null ? null : adetGecerli(ham)
  if (ham !== null && temiz === null) {
    return hata('aylikKapasite negatif olmayan tam sayı ya da null olmalı')
  }
  const deger = temiz !== null && temiz > 0 ? temiz : null
  const tenantId = await atolyeTenant(sql, workshopId)
  if (!tenantId) return hata('Atölye bulunamadı', 404)

  if (deger === null) {
    await sql`UPDATE workshop_profil SET aylik_kapasite = NULL WHERE workshop_id = ${workshopId}`
  } else {
    await sql`
      INSERT INTO workshop_profil (workshop_id, tenant_id, aylik_kapasite, eslesme_yontemi, data_confidence)
      VALUES (${workshopId}, ${tenantId}, ${deger}, 'elle', 'yuksek')
      ON CONFLICT (workshop_id) DO UPDATE SET aylik_kapasite = EXCLUDED.aylik_kapasite`
  }
  return NextResponse.json({ ok: true, aylikKapasite: deger })
})
