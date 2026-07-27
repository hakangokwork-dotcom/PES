import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { validateRows, parseSimFile, buildSimDataFromRows, buildTemplateAOA, buildExampleTemplateAOA } from './sim-excel.js'
import { getDomain } from './domains/index.js'
import { fastForward, initialSimState } from './engine/simulation.js'

/* validateRows saf bir fonksiyon — xlsx dosyası okumaz, sadece zaten ayrıştırılmış
   satır objelerini (parseSimFile'ın ürettiği kanonik alan adlarıyla) doğrular.
   Burada yalnızca domain-parametreli opTypes davranışı test edilir. */

function row(overrides = {}) {
  return {
    anaGrup: 'A', opAdi: 'Dikiş 1', cevrim: 12, tip: 'DİKİM',
    makineKodu: '', operator: '',
    ...overrides,
  }
}

describe('validateRows — opTypes parametresi', () => {
  it('opTypes verilmezse Tip serbest metin kabul edilir (blank domain davranışı)', () => {
    const out = validateRows([row({ tip: 'HERHANGİ BİR ŞEY' })], ['A'])
    expect(out[0].ok).toBe(true)
    expect(out[0].errors).toEqual([])
  })

  it('opTypes boş dizi verilirse Tip serbest metin kabul edilir', () => {
    const out = validateRows([row({ tip: 'HERHANGİ BİR ŞEY' })], ['A'], [])
    expect(out[0].ok).toBe(true)
  })

  it('opTypes doluyken listede olan Tip geçerli sayılır', () => {
    const out = validateRows([row({ tip: 'DİKİM' })], ['A'], ['DİKİM', 'OVERLOK'])
    expect(out[0].ok).toBe(true)
    expect(out[0].tipUyari).toBeNull()
  })

  it('opTypes doluyken listede olmayan Tip UYARI verir — satır reddedilmez', () => {
    const out = validateRows([row({ tip: 'BİLİNMEYEN' })], ['A'], ['DİKİM', 'OVERLOK'])
    expect(out[0].ok).toBe(true)
    expect(out[0].errors).toEqual([])
    expect(out[0].tipUyari).toBe('Tip listede yok: BİLİNMEYEN')
  })

  it('allowedAnaGruplar hâlâ bağımsız çalışır (üçüncü parametre onu bozmaz)', () => {
    const out = validateRows([row({ anaGrup: 'Bilinmeyen Grup' })], ['A'], ['DİKİM'])
    expect(out[0].ok).toBe(false)
    expect(out[0].errors.some(e => e.includes('1.Seviye Süreç akışta yok'))).toBe(true)
  })

  it('boş Tip: opTypes doluysa ilk tip atanır', () => {
    const [v] = validateRows([row({ tip: '' })], ['A'], ['DİKİM', 'ÜTÜ'])
    expect(v.tip).toBe('DİKİM')
    expect(v.ok).toBe(true)
  })

  it('boş Tip: opTypes boşsa boş kalır (tekstil sızıntısı yok)', () => {
    const [v] = validateRows([row({ tip: '' })], ['A'], [])
    expect(v.tip).toBe('')
    expect(v.ok).toBe(true)
  })

  it('allowedAnaGruplar boşsa her grup adı kabul edilir (tekstil listesi fallback yok)', () => {
    const out = validateRows([row({ anaGrup: 'Tamamen Serbest Grup' })], [], [])
    expect(out[0].ok).toBe(true)
    expect(out[0].errors).toEqual([])
  })
})

describe('Öncesi kolonu ayrıştırma + doğrulama', () => {
  it('validateRows: oncesiList + oncesiUyari üretir (bilinen öncüller)', async () => {
    const rows = [
      { anaGrup: 'Ön Bant', opAdi: 'a', cevrim: 10, oncesi: '' },
      { anaGrup: 'Montaj', opAdi: 'm', cevrim: 20, oncesi: 'Ön Bant, Arka Bant' },
    ]
    const v = validateRows(rows, ['Ön Bant', 'Arka Bant', 'Montaj'], ['DİKİM'])
    expect(v[1].oncesiList).toEqual(['Ön Bant', 'Arka Bant'])
    expect(v[1].oncesiUyari).toBeNull()
  })
  it('bilinmeyen öncül adı → oncesiUyari (satır ok kalır)', () => {
    const rows = [{ anaGrup: 'Montaj', opAdi: 'm', cevrim: 20, oncesi: 'Yok Grup' }]
    const v = validateRows(rows, ['Montaj'], ['DİKİM'])
    expect(v[0].ok).toBe(true)
    expect(v[0].oncesiUyari).toMatch(/Yok Grup/)
  })
  it('boş öncesi → oncesiList boş dizi, uyarı yok', () => {
    const v = validateRows([{ anaGrup: 'Montaj', opAdi: 'm', cevrim: 5, oncesi: null }], ['Montaj'], ['DİKİM'])
    expect(v[0].oncesiList).toEqual([])
    expect(v[0].oncesiUyari).toBeNull()
  })
  it('allowed=null iken tuhaf öncül adı olsa da uyarı yok', () => {
    const v = validateRows([{ anaGrup: 'Montaj', opAdi: 'm', cevrim: 5, oncesi: 'Yok Grup' }], null, ['DİKİM'])
    expect(v[0].oncesiUyari).toBeNull()
  })
  it('ayraçlar: virgül / noktalı virgül / eğik çizgi hepsi bölünür', () => {
    const v = validateRows([{ anaGrup: 'M', opAdi: 'm', cevrim: 5, oncesi: 'A; B / C' }], null, [])
    expect(v[0].oncesiList).toEqual(['A', 'B', 'C'])
  })
  it('ayraç: satır sonu (\\n) da bölünür', () => {
    const v = validateRows([{ anaGrup: 'M', opAdi: 'm', cevrim: 5, oncesi: 'A\nB' }], null, [])
    expect(v[0].oncesiList).toEqual(['A', 'B'])
  })
  it('öncül eşleşmesi case-insensitive — farklı büyük/küçük harf uyarı vermez', () => {
    const v = validateRows([{ anaGrup: 'Montaj', opAdi: 'm', cevrim: 5, oncesi: 'montaj' }], ['Montaj'], ['DİKİM'])
    expect(v[0].oncesiUyari).toBeNull()
  })
})

/* ─────── parseSimFile başlık eşlemesi ───────
   parseSimFile girdiden yalnızca .arrayBuffer() bekler — File/Blob polyfill'ine gerek yok,
   XLSX.write(..., { type: 'array' }) çıktısını duck-type bir objeyle sarmak yeterli. */

function fakeFileFromRows(header, dataRows) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows])
  XLSX.utils.book_append_sheet(wb, ws, 'Operasyonlar')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return { arrayBuffer: async () => buf }
}

describe('parseSimFile — başlık eşlemesi', () => {
  it('legacy başlıklar kanonik alanlara eşlenir (domain verilmeden)', async () => {
    const file = fakeFileFromRows(
      ['Ana Grup', 'Operasyon Adı', 'Çevrim (sn)', 'Tip', 'Makine Kodu', 'Operatör'],
      [['Montaj', 'Yan Çatma', 45, 'OVERLOK', 'OV-3', 'Ayşe']],
    )
    const { rows } = await parseSimFile(file)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      anaGrup: 'Montaj', opAdi: 'Yan Çatma', cevrim: 45,
      tip: 'OVERLOK', makineKodu: 'OV-3', operator: 'Ayşe',
    })
  })

  it('"Öncesi" başlığı kanonik oncesi alanına eşlenir (alias uçtan uca)', async () => {
    const file = fakeFileFromRows(
      ['Ana Grup', 'Operasyon Adı', 'Çevrim (sn)', 'Tip', 'Makine Kodu', 'Operatör', 'Öncesi'],
      [['Montaj', 'Yan Çatma', 45, 'OVERLOK', 'OV-3', 'Ayşe', 'Ön Bant, Arka Bant']],
    )
    const { rows } = await parseSimFile(file)
    expect(rows[0].oncesi).toBe('Ön Bant, Arka Bant')
  })

  it('blank domain başlıkları (Kaynak Kodu / Personel) aynı kanonik alanlara eşlenir', async () => {
    const file = fakeFileFromRows(
      ['Ana Grup', 'Operasyon Adı', 'Çevrim (sn)', 'Tip', 'Kaynak Kodu', 'Personel'],
      [['Süreç 1', 'Kontrol', 30, 'Serbest Tip', 'K-1', 'Mehmet']],
    )
    const { rows } = await parseSimFile(file, getDomain('blank'))
    expect(rows[0]).toMatchObject({
      anaGrup: 'Süreç 1', opAdi: 'Kontrol', cevrim: 30,
      tip: 'Serbest Tip', makineKodu: 'K-1', operator: 'Mehmet',
    })
  })

  it('seviye bazlı başlıkları ve virgüllü çevrimi okur', async () => {
    const file = fakeFileFromRows(
      ['1Seviye Süreç (ana Süreç)', '2. Seviye Süreç', '3.Seviye Süreç', 'Çevrim (sn)', 'Tip', 'Makine Kodu', 'Operatör'],
      [['yapma', 'Hazırlık', 'Kemer Çatım', '17,08', 'DİKİM', '', '']],
    )
    const { rows } = await parseSimFile(file)
    const [v] = validateRows(rows, [], ['DİKİM'])
    expect(v.ok).toBe(true)
    expect(v.processLevels).toEqual(['yapma', 'Hazırlık', 'Kemer Çatım'])
    expect(v.opAdi).toBe('Kemer Çatım')
    expect(v.cevrim).toBe(17.08)
  })

  it('alias çakışma koruması: labels.person = "Tip" olan domain Tip sütununu bozmaz', async () => {
    const fakeDomain = { labels: { resource: 'Alet', person: 'Tip' } }
    const file = fakeFileFromRows(
      ['Ana Grup', 'Operasyon Adı', 'Çevrim (sn)', 'Tip', 'Alet Kodu', 'Operatör'],
      [['G1', 'Op 1', 20, 'KESİM', 'A-7', 'Ali']],
    )
    const { rows } = await parseSimFile(file, fakeDomain)
    // 'Tip' başlığı hâlâ kanonik `tip` alanına gider, operator'e AKMAZ;
    // domain'in kendi 'Alet Kodu' başlığı ise normal şekilde eşlenir.
    expect(rows[0].tip).toBe('KESİM')
    expect(rows[0].operator).toBe('Ali')
    expect(rows[0].makineKodu).toBe('A-7')
  })
})

describe('buildSimDataFromRows — mainOp id slug çakışması', () => {
  it('Süreç 1-3 grupları için 3 BENZERSİZ mainOp id üretir; her subOp kendi grubuna bağlanır', () => {
    const validated = validateRows([
      row({ anaGrup: 'Süreç 1', opAdi: 'Op A' }),
      row({ anaGrup: 'Süreç 2', opAdi: 'Op B' }),
      row({ anaGrup: 'Süreç 3', opAdi: 'Op C' }),
    ], [], [])
    expect(validated.every(v => v.ok)).toBe(true)
    const built = buildSimDataFromRows(validated)

    const ids = built.mainOps.map(m => m.id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)   // çakışma yok (eskiden üçü de 'mo_sre_' idi)

    // Her subOp kendi ana grubunun mainOp'una atanmış olmalı
    expect(built.subOps).toHaveLength(3)
    const pairs = built.subOps.map(s => {
      const mo = built.mainOps.find(m => m.id === s.mainOpId)
      return [s.name, mo?.name]
    })
    expect(pairs).toEqual([['Op A', 'Süreç 1'], ['Op B', 'Süreç 2'], ['Op C', 'Süreç 3']])
  })

  it('regresyon: 6 standart tekstil grubunun id\'leri değişmedi', () => {
    const groups = ['Ön Bant', 'Arka Bant', 'Montaj', 'UKP', 'Yıkama', 'Son Montaj']
    const validated = validateRows(
      groups.map((g, i) => row({ anaGrup: g, opAdi: `Op ${i}` })),
      groups, ['DİKİM'],
    )
    const built = buildSimDataFromRows(validated.filter(v => v.ok))
    // Değişiklik öncesi slug'larla birebir aynı (rakam regexinin bu adlara etkisi yok,
    // Set yalnızca çakışmada devreye girer — ilk geçişler orijinal slug'ını korur)
    expect(built.mainOps.map(m => m.id)).toEqual([
      'mo_n_bant', 'mo_arka_bant', 'mo_montaj', 'mo_ukp', 'mo_ykama', 'mo_son_montaj',
    ])
  })
})

describe('buildSimDataFromRows — Öncesi grafiği', () => {
  const R = (anaGrup, opAdi, cevrim, oncesiList = []) =>
    ({ anaGrup, opAdi, cevrim, tip: 'DİKİM', makineKodu: '', operator: '', oncesiList })

  it('Öncesi ile paralel birleşme: Ön Bant + Arka Bant → Montaj', () => {
    const rows = [
      R('Ön Bant', 'o1', 10), R('Arka Bant', 'a1', 12), R('Montaj', 'm1', 20, ['Ön Bant', 'Arka Bant']),
    ]
    const { mainOps, warnings } = buildSimDataFromRows(rows, { machines: [], operators: [], mainOps: null })
    const byName = (n) => mainOps.find(m => m.name === n)
    expect(byName('Ön Bant').nextIds).toContain(byName('Montaj').id)
    expect(byName('Arka Bant').nextIds).toContain(byName('Montaj').id)
    expect(byName('Montaj').nextIds).toEqual([])   // Montaj ardılsız
    expect(warnings).toEqual([])
  })

  it('Öncesi YOKken davranış değişmez (lineer/successorMap fallback)', () => {
    const rows = [R('Ön Bant', 'o1', 10), R('Montaj', 'm1', 20)]   // oncesiList boş
    const { mainOps } = buildSimDataFromRows(rows, { machines: [], operators: [], mainOps: null })
    // Öncesi kolonu hiç yok → mevcut fallback: Ön Bant → Montaj (successorMap)
    const byName = (n) => mainOps.find(m => m.name === n)
    expect(byName('Ön Bant').nextIds).toContain(byName('Montaj').id)
  })

  it('döngü → uyarı + kenar atlanır (kilitlenme yok)', () => {
    const rows = [R('A', 'a', 5, ['B']), R('B', 'b', 5, ['A'])]
    const { mainOps, warnings } = buildSimDataFromRows(rows, { machines: [], operators: [], mainOps: null })
    // en az bir kenar atlanmış olmalı; hiçbir düğüm kendine/döngüye kilitlenmemeli
    expect(warnings.some(w => /döngü/i.test(w))).toBe(true)
    const a = mainOps.find(m => m.name === 'A'), b = mainOps.find(m => m.name === 'B')
    const cyclic = a.nextIds.includes(b.id) && b.nextIds.includes(a.id)
    expect(cyclic).toBe(false)
  })

  it('mevcut mainOps konum/renk/id korunur, nextIds Öncesi\'den yeniden kurulur', () => {
    const existing = { machines: [], operators: [], mainOps: [
      { id: 'mo_on', name: 'Ön Bant', color: '#111', order: 0, nextIds: ['ESKI'], x: 999, y: 888 },
      { id: 'mo_mo', name: 'Montaj', color: '#222', order: 1, nextIds: [], x: 5, y: 6 },
    ] }
    const rows = [R('Ön Bant', 'o1', 10), R('Montaj', 'm1', 20, ['Ön Bant'])]
    const { mainOps } = buildSimDataFromRows(rows, existing)
    const on = mainOps.find(m => m.name === 'Ön Bant')
    expect(on.x).toBe(999); expect(on.color).toBe('#111'); expect(on.id).toBe('mo_on')   // korunur
    expect(on.nextIds).toEqual([mainOps.find(m => m.name === 'Montaj').id])              // Öncesi'den yeniden
    // çağıranın orijinal nextIds dizisi reset+rebuild ile MUTATE edilmemeli
    expect(existing.mainOps[0].nextIds).toEqual(['ESKI'])
  })

  it('Türkçe İ/ı: İplik grubu, küçük harf "iplik" öncülü gerçek kenara çözülür (bulunamadı yok)', () => {
    const rows = [R('İplik', 'i1', 10), R('Dokuma', 'd1', 20, ['iplik'])]
    const { mainOps, warnings } = buildSimDataFromRows(rows, { machines: [], operators: [], mainOps: null })
    const iplik = mainOps.find(m => m.name === 'İplik'), dokuma = mainOps.find(m => m.name === 'Dokuma')
    expect(iplik.nextIds).toContain(dokuma.id)
    expect(warnings).toEqual([])
  })

  it('3-düğümlü döngü A→B→C→A → uyarı + graf asiklik (tam döngü kurulmaz)', () => {
    const rows = [R('A', 'a', 5, ['C']), R('B', 'b', 5, ['A']), R('C', 'c', 5, ['B'])]
    const { mainOps, warnings } = buildSimDataFromRows(rows, { machines: [], operators: [], mainOps: null })
    expect(warnings.some(w => /döngü/i.test(w))).toBe(true)
    const a = mainOps.find(m => m.name === 'A'), b = mainOps.find(m => m.name === 'B'), c = mainOps.find(m => m.name === 'C')
    // Üç geri-kenarın hepsi birden bulunmamalı (tam döngü kilitlenmez)
    const fullLoop = a.nextIds.includes(b.id) && b.nextIds.includes(c.id) && c.nextIds.includes(a.id)
    expect(fullLoop).toBe(false)
  })

  it('subOps grup icinde lineer kalir; gruplar arasi akis mainOps koprusunden tasinir', () => {
    const rows = [R('Ön Bant', 'o1', 10), R('Ön Bant', 'o2', 8), R('Montaj', 'm1', 20, ['Ön Bant'])]
    const { mainOps, subOps } = buildSimDataFromRows(rows, { machines: [], operators: [], mainOps: null })
    const o1 = subOps.find(s => s.name === 'o1'), o2 = subOps.find(s => s.name === 'o2'), m1 = subOps.find(s => s.name === 'm1')
    expect(o1.nextIds).toEqual([o2.id])          // grup içi lineer
    expect(o2.nextIds).toEqual([])               // gruplar arasi dogrudan alt-op link yok
    expect(mainOps.find(m => m.name === 'Ön Bant').nextIds).toContain(mainOps.find(m => m.name === 'Montaj').id)
    expect(m1.nextIds).toEqual([])
  })
})

describe('buildSimDataFromRows — seviye bazlı akış', () => {
  const V = (levels, cevrim = 10, sira = null) => ({
    ok: true,
    anaGrup: levels[0],
    opAdi: levels[levels.length - 1],
    opPath: levels.slice(1),
    processLevels: levels,
    processPath: levels.join(' / '),
    cevrim,
    tip: 'DİKİM',
    makineKodu: '',
    operator: '',
    oncesiList: [],
    ...(sira != null ? { sira } : {}),
  })

  it('sadece 1.Seviye yüklendiğinde her satırı akış adımı yapar ve simülasyon sırasını korur', () => {
    const built = buildSimDataFromRows([
      V(['Kemer Çatım'], 17.08, 1),
      V(['Kemer Çıma'], 11.66, 2),
      V(['Biye İlik'], 7.63, 3),
    ])
    expect(built.mainOps.map(m => m.name)).toEqual(['Kemer Çatım', 'Kemer Çıma', 'Biye İlik'])
    expect(built.mainOps[0].nextIds).toEqual([built.mainOps[1].id])
    expect(built.mainOps[1].nextIds).toEqual([built.mainOps[2].id])
    expect(built.subOps.map(s => s.name)).toEqual(['Kemer Çatım', 'Kemer Çıma', 'Biye İlik'])
  })

  it('1+2.Seviye yüklendiğinde 1.Seviye akışı, 2.Seviye üretim sırasını kurar', () => {
    const built = buildSimDataFromRows([
      V(['Hazırlık', 'Kemer Çatım'], 17.08, 1),
      V(['Hazırlık', 'Kemer Çıma'], 11.66, 2),
      V(['Ön Bant', 'Ön Kemer Takma'], 32.15, 3),
    ])
    expect(built.mainOps.map(m => m.name)).toEqual(['Hazırlık', 'Ön Bant'])
    expect(built.mainOps[0].nextIds).toEqual([built.mainOps[1].id])
    expect(built.subOps.map(s => s.name)).toEqual(['Kemer Çatım', 'Kemer Çıma', 'Ön Kemer Takma'])
    expect(built.subOps[1].nextIds).toEqual([])
  })

  it('1+2+3.Seviye yüklendiğinde en alt seviyeyi üretim operasyonu yapar', () => {
    const built = buildSimDataFromRows([
      V(['yapma', 'Hazırlık', 'Kemer Çatım'], 17.08, 1),
      V(['yapma', 'Ön Bant', 'Ön Kemer Takma'], 32.15, 2),
      V(['Birleştirme', 'Arka Bant', 'Etek Dönüp İp'], 12.34, 3),
    ])
    expect(built.mainOps.map(m => m.name)).toEqual(['yapma', 'Birleştirme'])
    expect(built.subOps.map(s => s.name)).toEqual(['Kemer Çatım', 'Ön Kemer Takma', 'Etek Dönüp İp'])
    expect(built.subOps[1].nextIds).toEqual([])
    expect(built.mainOps[0].nextIds).toEqual([built.mainOps[1].id])
  })
})

describe('buildTemplateAOA — şablon ve örnek sayfaları', () => {
  it('ana Operasyonlar şablonu boş ve doldurulabilir gelir', () => {
    const aoa = buildTemplateAOA(null, getDomain('textile'))
    const header = aoa[0]
    expect(header[header.length - 1]).toBe('Öncesi')
    expect(header).toEqual([
      'Sıra', '1.Seviye Süreç', '2.Seviye Süreç', '3.Seviye Süreç',
      'Çevrim (sn)', 'Tip', 'Makine Kodu', 'Operatör', 'Öncesi',
    ])
    expect(aoa.slice(1)).toHaveLength(8)
    expect(aoa.slice(1).every(r => r[1] === '' && r[2] === '' && r[4] === '')).toBe(true)
  })

  it('kullanici flowNames verildiginde sadece ana grup adlarini tasir', () => {
    const aoa = buildTemplateAOA([{ name: 'Kesim' }, { name: 'Dikim' }], getDomain('textile'))
    expect(aoa[0][aoa[0].length - 1]).toBe('Öncesi')
    expect(aoa.slice(1).map(r => r[1])).toEqual(['Kesim', 'Dikim'])
    expect(aoa.slice(1).every(r => r[2] === '' && r[3] === '' && r[4] === '' && r[8] === '')).toBe(true)
  })

  it('Ornekler sayfasindaki case geri yuklenince simulasyon urun cikarir', () => {
    const aoa = buildExampleTemplateAOA(getDomain('textile'))
    const [header, ...dataRows] = aoa
    const aliases = {
      'Sıra': 'sira',
      '1.Seviye Süreç': 'seviye1',
      '2.Seviye Süreç': 'seviye2',
      '3.Seviye Süreç': 'seviye3',
      'Çevrim (sn)': 'cevrim',
      'Tip': 'tip',
      'Makine Kodu': 'makineKodu',
      'Operatör': 'operator',
      'Öncesi': 'oncesi',
    }
    const rows = dataRows.map(values => Object.fromEntries(
      header.map((key, idx) => [aliases[key] || key, values[idx]]),
    ))
    const validated = validateRows(rows, ['Hazırlık', 'Birleştirme', 'Paket'], getDomain('textile').opTypes)
    expect(validated.every(r => r.ok)).toBe(true)

    const built = buildSimDataFromRows(validated, { machines: [], operators: [], mainOps: null })
    const end = fastForward(initialSimState(), { ...built, settings: { netMinutes: 60 } })
    expect(end.exited).toBeGreaterThan(0)
  })
})
