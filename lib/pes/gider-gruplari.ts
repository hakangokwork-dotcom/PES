/**
 * Kanonik gider grupları G1–G8 — etiket, renk ve sıra.
 *
 * Kaynak: migration 021 `v_expense_groups`. Hem /pes/gider-panosu (gider
 * YAPISI) hem /pes/ekonomi maliyet DNA'sı (ekonomi) aynı sekiz grubu
 * gösteriyor; renkler iki yerde ayrı tanımlıydı ve zamanla ayrışırdı.
 */

export const G_ETIKET = {
  g1_iscilik: 'G1 İşçilik',
  g2_personel_yan: 'G2 Personel yan',
  g3_enerji: 'G3 Enerji',
  g4_mekan: 'G4 Mekân',
  g5_makine: 'G5 Makine',
  g6_sarf: 'G6 Sarf',
  g7_dis_hizmet: 'G7 Dış hizmet',
  g8_diger: 'G8 Diğer',
} as const

export type GKey = keyof typeof G_ETIKET
export const G_KEYS: GKey[] = Object.keys(G_ETIKET) as GKey[]

/**
 * WCAG-uyumlu, sıra bağımlı kararlı palet — aynı satırda sekiz rengin
 * okunabilir kalması için. Tailwind sınıfı değil HEX: SVG doldurma.
 */
export const G_RENK: Record<GKey, string> = {
  g1_iscilik: '#2563eb',       // mavi — en büyük pay çoğu zaman burada
  g2_personel_yan: '#0ea5e9',  // açık mavi (kişi kaynaklı)
  g3_enerji: '#eab308',        // amber
  g4_mekan: '#a855f7',         // mor
  g5_makine: '#64748b',        // gri (sermaye)
  g6_sarf: '#10b981',          // yeşil (sarf)
  g7_dis_hizmet: '#f97316',    // turuncu
  g8_diger: '#94a3b8',         // gri açık
}

/** Grubun ne içerdiği — DNA ekranında ipucu olarak gösterilir. */
export const G_ICERIK: Record<GKey, string> = {
  g1_iscilik: 'Maaş, SGK, fazla mesai, prim, kıdem karşılığı',
  g2_personel_yan: 'Yemek, servis',
  g3_enerji: 'Elektrik, su, doğalgaz',
  g4_mekan: 'Kira, bina amortismanı',
  g5_makine: 'Makine amortismanı, bakım, taşıt/demirbaş amortismanı',
  g6_sarf: 'İplik, iğne, genel üretim sarfı, UKP sarfı',
  g7_dis_hizmet: 'Sigorta, İSG, danışmanlık, resmi harç, iletişim, kırtasiye, kargo, araç',
  g8_diger: 'Sınıflanamayan kalemler',
}
