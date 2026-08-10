'use client'

import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip,
} from 'recharts'
import { GRAFIK_AKSAN, GRAFIK_IZGARA, GRAFIK_ETIKET } from '@/lib/ui/tone'
import type { KategoriSeviye } from '@/lib/pes/olgunluk-denetim'

/* KATEGORİ PROFİLİ — radar + değer listesi, yan yana.

   NEDEN TEK SERİ: radara "mevcut" ve "en zayıf" diye iki halka çizmek
   akla yatkın görünüyordu, ama iki rengin ayrılabilirliği ölçüldüğünde
   düştü: marka yeşili #197A56 ile nötr gri #5B6874 arasında normal
   görüşte ΔE 10.4 (eşik 15), renk körlüğünde 4.9. Kesikli çizgi gibi
   ikincil kodlamalar bu eşiği mazur göstermiyor. Radar tek şeyi anlatır
   — profilin şeklini; "en zayıf halka" yandaki listede sayı olarak durur.

   NEDEN LİSTE DE VAR: radar oranları göz kararı okutur, iki eksen
   birbirine yakınsa hangisinin yüksek olduğu ayırt edilemez. Yandaki
   çubuklu liste kesin değeri verir. Radar şekli, liste sayıyı taşır.

   Eksende KOD yazar (K1, K2…), tam ad tooltip'te ve listede: on kategori
   adının tamamı çemberin etrafına sığmıyor, üst üste biniyordu. */

type Nokta = {
  kod: string
  ad: string
  seviye: number | null
  olculdu: boolean
  enZayif: number | null
}

export default function OlgunlukRadar({ kategoriler }: { kategoriler: KategoriSeviye[] }) {
  const veri: Nokta[] = [...kategoriler]
    .sort((a, b) => a.sira - b.sira)
    .map((k) => ({
      kod: k.kategori_kod,
      ad: k.kategori_adi,
      seviye: k.ortalama_seviye === null ? null : Number(k.ortalama_seviye),
      olculdu: k.ortalama_seviye !== null,
      enZayif: k.en_zayif_seviye,
    }))

  /* POLİGON YALNIZ ÖLÇÜLEN KATEGORİLERDEN.
     Ölçülmemiş kategoriyi eksende bırakmak denendi (seviye=null +
     connectNulls); recharts null'ı MERKEZE çiziyor — DOM'daki path'in o
     köşesi tam merkez çıktı. Yani "değerlendirilmedi", ekranda "sıfır
     aldı" gibi görünüyordu. Ölçülmemişi eksenden düşürmek, çerçevenin
     denetim ilerledikçe genişlemesi pahasına doğru olanı gösterir. */
  const olculen = veri.filter((v) => v.olculdu)
  const eksik = veri.length - olculen.length

  /* Üç köşeden azı şekil oluşturmaz — nokta ya da çizgi çıkar ve radar
     olduğunu iddia eden yanıltıcı bir görsel verir. */
  if (olculen.length < 3) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-faint">
          {olculen.length === 0
            ? 'Henüz değerlendirilmiş kategori yok — madde işaretledikçe profil oluşacak.'
            : `Profil için en az 3 kategori gerekiyor (şu an ${olculen.length}).`}
        </p>
        <KategoriListesi veri={veri} />
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(260px,380px)_1fr] lg:items-center">
      <div>
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart data={olculen} outerRadius="72%"
                      margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <PolarGrid stroke={GRAFIK_IZGARA} />
            <PolarAngleAxis dataKey="kod" tick={{ fontSize: 11, fill: GRAFIK_ETIKET }} />
            {/* Ölçek her zaman 0-3: şekil atölyeler arasında ve zaman içinde
                karşılaştırılabilir olsun. Eksen hiç konmazsa recharts otomatik
                ölçekler ve kötü bir denetimi iyi gösterir.
                Etiketleri KAPALI: çemberin içinde poligonun üstüne biniyordu;
                sayılar zaten yandaki listede. */}
            <PolarRadiusAxis domain={[0, 3]} tick={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 8, border: `1px solid ${GRAFIK_IZGARA}`,
                fontSize: 12, boxShadow: '0 4px 12px rgba(15,23,32,.07)',
              }}
              labelStyle={{ color: '#0F1720', fontWeight: 600 }}
              formatter={(v: unknown) => [`${Number(v).toFixed(1)} / 3`, 'Ortalama seviye']}
              labelFormatter={(kod) => veri.find((x) => x.kod === kod)?.ad ?? String(kod ?? '')}
            />
            {/* Animasyon KAPALI: radar her işaretlemede yeniden çiziliyor,
                her kayıtta merkezden büyümesi dikkat dağıtırdı. */}
            <Radar
              name="Ortalama seviye"
              dataKey="seviye"
              stroke={GRAFIK_AKSAN}
              strokeWidth={2}
              fill={GRAFIK_AKSAN}
              fillOpacity={0.18}
              dot={{ r: 3, fill: GRAFIK_AKSAN, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>

        <p className="mt-1 text-center text-[11px] text-faint">
          Ölçek 0-3 · {olculen.length} kategori
          {eksik > 0 && ` · ${eksik} kategori henüz değerlendirilmedi, profile dahil değil`}
        </p>
      </div>

      <KategoriListesi veri={veri} />
    </div>
  )
}

function KategoriListesi({ veri }: { veri: Nokta[] }) {
  return (
    <ul className="space-y-1">
      {veri.map((k) => (
        <li key={k.kod} className="flex items-center gap-3 py-0.5 text-[13px]">
          <span className="num w-8 shrink-0 text-faint">{k.kod}</span>
          <span className="min-w-0 flex-1 truncate text-body" title={k.ad}>{k.ad}</span>

          {/* Çubuk: radarın veremediği kesin karşılaştırma. Tek hue,
              daha çok = daha dolu — büyüklük için sıralı kodlama. */}
          <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-canvas sm:block">
            <span className="block h-full rounded-full"
                  style={{ width: `${((k.seviye ?? 0) / 3) * 100}%`, background: GRAFIK_AKSAN }} />
          </span>

          <span className={'num w-8 shrink-0 text-right ' + (k.olculdu ? 'text-ink' : 'text-faint')}>
            {k.seviye === null ? '—' : k.seviye.toFixed(1)}
          </span>
          <span className="num w-14 shrink-0 text-right text-[11px] text-faint"
                title="Kategorideki en düşük süreç seviyesi — zayıf halka">
            {k.enZayif === null ? '' : `en az ${k.enZayif}`}
          </span>
        </li>
      ))}
    </ul>
  )
}
