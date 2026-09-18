'use client'

/**
 * Radar Client — dönem + rasyo + atölye seçim state'ini yönetir.
 * 5 bölümü alt bileşenlere dağıtır.
 */
import { useState } from 'react'
import Link from 'next/link'
import type { AtolyeRasyolari } from '@/lib/pes/ekonomi-radar'
import { siralamaHesapla, rasyoIstatistik, rasyoSiralari } from '@/lib/pes/ekonomi-radar'
import BolumTiles from './BolumTiles'
import BolumGenelSiralama from './BolumGenelSiralama'
import BolumRasyoGezgini from './BolumRasyoGezgini'
import BolumIsiHaritasi from './BolumIsiHaritasi'
import BolumAtolyeKarneleri from './BolumAtolyeKarneleri'
import { AY_ADLARI } from '@/lib/pes/donem'

type Props = {
  veri: AtolyeRasyolari[]
  secilenDonem: string
  donemler: Array<{ yil: number; ay: number }>
}

export default function RadarClient({ veri, secilenDonem, donemler }: Props) {
  const [odakWorkshopId, setOdakWorkshopId] = useState<number | null>(null)

  // Önbellek: tüm hesaplar burada; alt bileşenler prop olarak alır.
  const siralama = siralamaHesapla(veri)
  const istatistik = rasyoIstatistik(veri)
  const siralarTablosu = rasyoSiralari(veri)

  const [yilStr, ayStr] = secilenDonem.split('-')
  const yil = Number(yilStr)
  const ay = Number(ayStr)
  const donemEtiketi = AY_ADLARI?.[ay] ? `${AY_ADLARI[ay]} ${yil}` : secilenDonem

  return (
    <div className="space-y-8">
      {/* Başlık */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">
            Atölye Rasyo Radarı
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {veri.length} atölye · {secilenDonem} · 5 başlıkta karşılaştırma
          </p>
        </div>
        {/* Dönem seçici */}
        <div className="flex flex-wrap gap-1.5">
          {donemler.slice(0, 8).map(d => {
            const donemStr = `${d.yil}-${String(d.ay).padStart(2, '0')}`
            const secili = donemStr === secilenDonem
            return (
              <Link
                key={donemStr}
                href={`/pes/ekonomi?donem=${donemStr}`}
                className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                  secili
                    ? 'bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 border-neutral-900 dark:border-neutral-50'
                    : 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200/50 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
                }`}
              >
                {AY_ADLARI?.[d.ay] ?? d.ay} {d.yil}
              </Link>
            )
          })}
        </div>
      </div>

      {veri.length === 0 ? (
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200/50 rounded-xl p-12 text-center text-neutral-400 dark:text-neutral-500">
          {donemEtiketi} dönemine ait ekonomi verisi bulunamadı.
        </div>
      ) : (
        <>
          {/* Bölüm 1 — Üst kutucuklar */}
          <BolumTiles
            veri={veri}
            siralama={siralama}
            istatistik={istatistik}
          />

          {/* Bölüm 2 — Genel sıralama */}
          <BolumGenelSiralama
            siralama={siralama}
            odakId={odakWorkshopId}
            onSecim={setOdakWorkshopId}
          />

          {/* Bölüm 3 — Rasyo gezgini */}
          <BolumRasyoGezgini
            veri={veri}
            istatistik={istatistik}
            siralarTablosu={siralarTablosu}
          />

          {/* Bölüm 4 — Isı haritası */}
          <BolumIsiHaritasi
            veri={veri}
            siralama={siralama}
            siralarTablosu={siralarTablosu}
          />

          {/* Bölüm 5 — Atölye karneleri */}
          <BolumAtolyeKarneleri
            siralama={siralama}
            istatistik={istatistik}
            odakId={odakWorkshopId}
            onSecim={setOdakWorkshopId}
          />
        </>
      )}
    </div>
  )
}
