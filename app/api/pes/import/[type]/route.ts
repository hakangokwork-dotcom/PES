import { NextResponse } from 'next/server'
import postgres from 'postgres'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import {
  enumCoz, enumHata, sayiAraliginda,
  DURUS_TIPLERI, BANT_TIPLERI, URETIM_TIPLERI,
} from '@/lib/pes/import-dogrula'

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(';').map(h => h.trim().replace(/^﻿/, ''))
  return lines.slice(1).map(line => {
    const vals = line.split(';').map(v => v.trim())
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
}

async function importStandard(type: string, rows: Record<string, string>[], sql: postgres.TransactionSql, tenantId: string, wid: number, year: number, month: number, formData: FormData) {
  let imported = 0

  if (type === 'production') {
    for (const r of rows) {
      const [line] = await sql`SELECT id FROM production_line WHERE code = ${r.bant_kodu} AND workshop_id = ${wid}`
      if (!line) continue
      await sql`INSERT INTO monthly_production (tenant_id, line_id, workshop_id, year, month, model_code, total_sam, target_qty, actual_qty, work_days)
        VALUES (${tenantId}, ${line.id}, ${wid}, ${year}, ${month}, ${r.model_kodu}, ${Number(r.toplam_sam_sn) || 0}, ${Number(r.hedef_adet) || 0}, ${Number(r.gercek_adet) || 0}, ${Number(r.calisma_gunu) || 22})
        ON CONFLICT (line_id, year, month, model_code) DO UPDATE SET total_sam=EXCLUDED.total_sam, target_qty=EXCLUDED.target_qty, actual_qty=EXCLUDED.actual_qty, work_days=EXCLUDED.work_days`
      imported++
    }
  } else if (type === 'expenses') {
    const r = rows[0]
    await sql`INSERT INTO monthly_expense (tenant_id,workshop_id,year,month,work_days,personnel,sgk,food,electricity,water,gas,transport,vehicle,cargo,machine_maint,thread,other,target_revenue)
      VALUES (${tenantId},${wid},${year},${month},${Number(r.calisma_gunu)||22},${Number(r.personel)||0},${Number(r.sgk)||0},${Number(r.yemek)||0},${Number(r.elektrik)||0},${Number(r.su)||0},${Number(r.dogalgaz)||0},${Number(r.servis)||0},${Number(r.arac)||0},${Number(r.kargo)||0},${Number(r.makina_bakim)||0},${Number(r.iplik)||0},${Number(r.diger)||0},${Number(r.hedef_ciro)||0})
      ON CONFLICT (workshop_id,year,month) DO UPDATE SET work_days=EXCLUDED.work_days,personnel=EXCLUDED.personnel,sgk=EXCLUDED.sgk,food=EXCLUDED.food,electricity=EXCLUDED.electricity,water=EXCLUDED.water,gas=EXCLUDED.gas,transport=EXCLUDED.transport,vehicle=EXCLUDED.vehicle,cargo=EXCLUDED.cargo,machine_maint=EXCLUDED.machine_maint,thread=EXCLUDED.thread,other=EXCLUDED.other,target_revenue=EXCLUDED.target_revenue`
    imported = 1
  } else if (type === 'quality') {
    for (const r of rows) {
      const lineId = r.bant_kodu ? (await sql`SELECT id FROM production_line WHERE code=${r.bant_kodu} AND workshop_id=${wid}`)[0]?.id : null
      await sql`INSERT INTO quality_record (tenant_id,workshop_id,line_id,year,month,inspected_qty,first_pass_qty,rejected_qty,rework_qty,customer_return,top_defect_cat,model_code)
        VALUES (${tenantId},${wid},${lineId??null},${year},${month},${Number(r.kontrol_edilen)||0},${Number(r.ilk_gecis)||0},${Number(r.red_edilen)||0},${Number(r.yeniden_islem)||0},${Number(r.musteri_iade)||0},${r.en_sik_hata||null},${r.model_kodu||null})`
      imported++
    }
  } else if (type === 'downtime') {
    for (const [i, r] of rows.entries()) {
      const [line] = await sql`SELECT id FROM production_line WHERE code=${r.bant_kodu} AND workshop_id=${wid}`
      if (!line) continue
      /* Boş bırakılırsa 'Plansız' varsayılır; DOLU ama tanınmayan değer
         sessizce varsayılana düşmez — kullanıcı ne yazdığını bilmeli.
         Eskiden buraya ham 'Plansiz' yazılıyordu ve CHECK kısıtı reddediyordu. */
      const tip = r.tip?.trim() ? enumCoz(r.tip, DURUS_TIPLERI) : 'Plansız'
      if (!tip) return { error: enumHata('tip', r.tip, DURUS_TIPLERI, i + 2) }
      await sql`INSERT INTO downtime_record (tenant_id,line_id,workshop_id,occurred_at,duration_min,downtime_type,reason,affected_ops)
        VALUES (${tenantId},${line.id},${wid},${r.tarih||new Date().toISOString()},${Number(r.sure_dk)||0},${tip},${r.neden||null},${Number(r.etkilenen_operasyon)||0})`
      imported++
    }
  } else if (type === 'workforce') {
    const r = rows[0]
    await sql`INSERT INTO workforce_turnover (tenant_id,workshop_id,year,month,total_staff,left_count,joined_count,in_warmup,avg_tenure_mon)
      VALUES (${tenantId},${wid},${year},${month},${Number(r.toplam_personel)||0},${Number(r.aydan_ayrilan)||0},${Number(r.aya_katilan)||0},${Number(r.isinma_doneminde)||0},${Number(r.ort_kidem_ay)||0})
      ON CONFLICT (workshop_id,year,month) DO UPDATE SET total_staff=EXCLUDED.total_staff,left_count=EXCLUDED.left_count,joined_count=EXCLUDED.joined_count,in_warmup=EXCLUDED.in_warmup,avg_tenure_mon=EXCLUDED.avg_tenure_mon`
    imported = 1
  } else if (type === 'changeover') {
    for (const r of rows) {
      const [line] = await sql`SELECT id FROM production_line WHERE code=${r.bant_kodu} AND workshop_id=${wid}`
      if (!line) continue
      /* Model kodları şablonda isteniyor ama eskiden hiç yazılmıyordu —
         sessiz veri kaybı. Katalogda yoksa NULL kalır (kolonlar nullable). */
      const modelIdBul = async (kod?: string) => {
        if (!kod?.trim()) return null
        const [m] = await sql`SELECT id FROM model_library WHERE code=${kod.trim()} AND workshop_id=${wid}`
        return m?.id ?? null
      }
      await sql`INSERT INTO changeover_record (tenant_id,line_id,occurred_date,from_model_id,to_model_id,total_min,machine_adj_min,balancing_min,first_batch_min,warmup_min)
        VALUES (${tenantId},${line.id},${r.tarih||new Date().toISOString().split('T')[0]},${await modelIdBul(r.onceki_model)},${await modelIdBul(r.sonraki_model)},${Number(r.toplam_dk)||0},${Number(r.makina_ayar_dk)||0},${Number(r.dengeleme_dk)||0},${Number(r.ilk_parti_dk)||0},${Number(r.isinma_dk)||0})`
      imported++
    }
  } else if (type === 'eder_operations') {
    const modelId = Number(formData.get('eder_model_id'))
    if (!modelId) return { error: 'eder_model_id gerekli' }
    const grupMap: Record<string, { sira: number; ops: Record<string, string>[] }> = {}
    let sira = 0
    for (const r of rows) {
      const g = r.operasyon_grubu
      if (!grupMap[g]) { grupMap[g] = { sira: ++sira, ops: [] } }
      grupMap[g].ops.push(r)
    }
    for (const [gAdi, g] of Object.entries(grupMap)) {
      const [grup] = await sql`INSERT INTO eder_operasyon_grubu (tenant_id,model_id,grup_adi,sira_no) VALUES (${tenantId},${modelId},${gAdi},${g.sira}) RETURNING id`
      for (let i = 0; i < g.ops.length; i++) {
        const op = g.ops[i]
        await sql`INSERT INTO eder_alt_operasyon (tenant_id,grup_id,operasyon_adi,sure_sn,kisi_sayisi,sira_no,makine_tipi)
          VALUES (${tenantId},${grup.id},${op.alt_operasyon},${Number(op.sure_sn)||0},${Number(op.kisi_sayisi)||1},${i+1},${op.makine_tipi||null})`
        imported++
      }
    }
  } else {
    return { error: 'Gecersiz import tipi' }
  }
  return { ok: true, imported, message: `${imported} kayit yuklendi` }
}

export const POST = withTenantRoute<{ type: string }>(async (req, { sql, tenant, params }) => {
  const { type } = params
  const formData = await req.formData()
  const file = formData.get('file') as File
  const workshopId = Number(formData.get('workshop_id'))
  const year = Number(formData.get('year') || 2026)
  const month = Number(formData.get('month') || 1)

  if (!file || !workshopId) return NextResponse.json({ error: 'file ve workshop_id gerekli' }, { status: 400 })

  const text = await file.text()

  if (type !== 'setup') {
    const rows = parseCSV(text)
    if (rows.length === 0) return NextResponse.json({ error: 'Dosyada veri bulunamadi' }, { status: 400 })
    const result = await importStandard(type, rows, sql, tenant.tenantId, workshopId, year, month, formData)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result)
  }

  let imported = 0
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  let section = ''
  const sections: Record<string, string[][]> = { profil: [], bantlar: [], gider: [] }

  for (const line of lines) {
    if (line.startsWith('## BOLUM 1')) { section = 'profil'; continue }
    if (line.startsWith('## BOLUM 2')) { section = 'bantlar'; continue }
    if (line.startsWith('## BOLUM 3')) { section = 'gider'; continue }
    /* Tek '#' ile başlayan satırlar şablondaki açıklamalar (hangi değerler
       geçerli). Bölüm içinde de gelebildikleri için veri sanılmamalı. */
    if (line.startsWith('#') || !section) continue
    sections[section].push(line.replace(/^﻿/, '').split(';').map(v => v.trim()))
  }

  if (sections.profil.length >= 2) {
    const h = sections.profil[0], v = sections.profil[1]
    const p: Record<string, string> = {}
    h.forEach((k, i) => { p[k] = v[i] ?? '' })

    /* ŞABLONDAKİ "tip" ÜRETİM TİPİDİR (CMT / Dikim …), atölye sınıfı DEĞİL.
       Eskiden bu değer workshop.type'a yazılıyordu: o kolon CHAR(1) ve yalnız
       A/B/C/X kabul ediyor, dolayısıyla şablonu dolduran HERKES
       "value too long for type character(1)" hatası alıyordu. Doğru hedef
       production_type (migration 023c bu ayrım için açtı). type'a hiç
       dokunulmuyor — atölyenin sınıfı bu dosyanın işi değil. */
    const uretimTipi = p.tip?.trim() ? enumCoz(p.tip, URETIM_TIPLERI) : null
    if (p.tip?.trim() && !uretimTipi) {
      return NextResponse.json({ error: enumHata('tip', p.tip, URETIM_TIPLERI) }, { status: 400 })
    }

    /* Teşvik bölgesi CHECK 1–6; aralık dışı sayı ham kısıt hatası vermesin. */
    const bolge = p.tesvik_bolgesi?.trim() ? sayiAraliginda(p.tesvik_bolgesi, 1, 6) : 1
    if (!bolge) {
      return NextResponse.json(
        { error: `tesvik_bolgesi "${p.tesvik_bolgesi}" — 1 ile 6 arasında olmalı` },
        { status: 400 }
      )
    }

    await sql`UPDATE workshop SET name=${p.atolye_adi||''},city=${p.sehir||null},district=${p.ilce||null},
      production_type=COALESCE(${uretimTipi}, production_type),
      bolge=${bolge},
      total_staff=${Number(p.toplam_personel)||0},sewing_staff=${Number(p.dikim_operatoru)||0},ukp_staff=${Number(p.ukp_personel)||0},
      cutting_staff=${Number(p.kesim_personel)||0},management=${Number(p.yonetim)||0},indirect=${Number(p.endirek)||0},
      line_count=${Number(p.bant_sayisi)||1},daily_target=${Number(p.gunluk_hedef)||0},net_hours_day=${Number(p.net_saat)||9}
      WHERE id=${workshopId}`
    imported++
  }

  if (sections.bantlar.length >= 2) {
    const bh = sections.bantlar[0]
    for (let i = 1; i < sections.bantlar.length; i++) {
      const v = sections.bantlar[i]
      if (v.length < 2) continue
      const bp: Record<string, string> = {}
      bh.forEach((k, j) => { bp[k] = v[j] ?? '' })
      if (!bp.bant_kodu) continue
      /* Eskiden yalnız 'Kucuk' string'i tanınıyordu: doğru yazımla "Küçük"
         yazan kullanıcı sessizce 'Normal'e düşüyordu — hata bile vermeden
         yanlış veri. Artık her iki yazım da çözülür, tanınmayan değer durdurur. */
      const bantTipi = bp.bant_tipi?.trim() ? enumCoz(bp.bant_tipi, BANT_TIPLERI) : 'Normal'
      if (!bantTipi) {
        return NextResponse.json(
          { error: enumHata('bant_tipi', bp.bant_tipi, BANT_TIPLERI, i + 1) },
          { status: 400 }
        )
      }
      await sql`INSERT INTO production_line (tenant_id,code,workshop_id,name,line_type,operator_count,daily_target)
        VALUES (${tenant.tenantId},${bp.bant_kodu},${workshopId},${bp.bant_adi||bp.bant_kodu},${bantTipi},${Number(bp.operator_sayisi)||0},${Number(bp.gunluk_hedef)||0})
        ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,line_type=EXCLUDED.line_type,operator_count=EXCLUDED.operator_count,daily_target=EXCLUDED.daily_target`
      imported++
    }
  }

  if (sections.gider.length >= 2) {
    const gh = sections.gider[0], gv = sections.gider[1]
    const g: Record<string, string> = {}
    gh.forEach((k, i) => { g[k] = gv[i] ?? '' })
    const gy = Number(g.yil)||year, gm = Number(g.ay)||month
    await sql`INSERT INTO monthly_expense (tenant_id,workshop_id,year,month,work_days,personnel,sgk,food,electricity,water,gas,transport,vehicle,cargo,machine_maint,thread,other,target_revenue)
      VALUES (${tenant.tenantId},${workshopId},${gy},${gm},${Number(g.calisma_gunu)||22},${Number(g.personel)||0},${Number(g.sgk)||0},${Number(g.yemek)||0},${Number(g.elektrik)||0},${Number(g.su)||0},${Number(g.dogalgaz)||0},${Number(g.servis)||0},${Number(g.arac)||0},${Number(g.kargo)||0},${Number(g.makina_bakim)||0},${Number(g.iplik)||0},${Number(g.diger)||0},${Number(g.hedef_ciro)||0})
      ON CONFLICT (workshop_id,year,month) DO UPDATE SET work_days=EXCLUDED.work_days,personnel=EXCLUDED.personnel,sgk=EXCLUDED.sgk,food=EXCLUDED.food,electricity=EXCLUDED.electricity,water=EXCLUDED.water,gas=EXCLUDED.gas,transport=EXCLUDED.transport,vehicle=EXCLUDED.vehicle,cargo=EXCLUDED.cargo,machine_maint=EXCLUDED.machine_maint,thread=EXCLUDED.thread,other=EXCLUDED.other,target_revenue=EXCLUDED.target_revenue`
    imported++
  }

  return NextResponse.json({ ok: true, imported, message: `Kurulum tamamlandi: ${imported} kayit` })
})
