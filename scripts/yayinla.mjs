#!/usr/bin/env node
/**
 * Yayın ritüeli — alias'ı en son production dağıtımına taşır ve DOĞRULAR.
 *
 *   node scripts/yayinla.mjs            son dağıtımı bul, alias'ı taşı, doğrula
 *   node scripts/yayinla.mjs --bekle    dağıtım henüz sürüyorsa bitmesini bekle
 *   node scripts/yayinla.mjs --kuru     ne yapacağını söyler, dokunmaz
 *
 * NEDEN VAR: `main`'e push edince Vercel yeni dağıtım üretiyor ama
 * `pes-platform-tan.vercel.app` alias'ı OTOMATİK TAŞINMIYOR. 2026-09-25'te
 * bu yüzden canlı adres haftalar öncesinin derlemesinde kalmıştı —
 * /pes/gider-panosu bile yoktu — ve kullanıcı yeni ekranları göremedi.
 * Aynı tuzak 2026-07-25 ve 2026-07-27'de de yaşanmış.
 *
 * SON ADIM DOĞRULAMA. Alias komutunun "Success" demesi yetmez: asıl soru
 * yeni rotaların canlıda cevap verip vermediği. Betik bunu ölçmeden
 * "yayınlandı" demiyor.
 */
import { execFileSync } from 'node:child_process'

const BEKLE = process.argv.includes('--bekle')
const KURU = process.argv.includes('--kuru')

const DEPO = 'hakangokwork-dotcom/PES'
/* İlk adres asıl canlı adres; doğrulama onun üzerinden yapılır çünkü
   *.vercel.app bazı ağlardan (kurum ağı, bazı sağlayıcılar) açılmıyor.
   www.fason.win 2026-11-09'dan beri asıl adres; fason.win oraya 308 ile
   yönlenir (Vercel proje ayarı). pes.provsm.com 2026-11-03'te kaldırıldı. */
const ALIASLAR = ['www.fason.win', 'pes-platform-tan.vercel.app']
const ALIAS = ALIASLAR[0]
const KAPSAM = 'promode'

/* Yeni derlemede VAR, eskisinde YOK olan yollar. 404 dönüyorsa alias
   hâlâ eski dağıtımı gösteriyor demektir. */
const KANIT_YOLLAR = ['/pes/ekonomi', '/pes/plan-tezgahi', '/workshop/changeover']

/* shell KAPALI: Windows'ta cmd.exe tek tırnağı anlamıyor ve `--jq` ifadesi
   parçalanıyordu. JSON'u Node ayrıştırıyor, kabuk hiç devreye girmiyor. */
function calistir(komut, argumanlar) {
  return execFileSync(komut, argumanlar, { encoding: 'utf8', windowsHide: true }).trim()
}

function ghJson(yol) {
  return JSON.parse(calistir('gh', ['api', yol]))
}

/* Windows'ta npx bir .cmd dosyasi. Node 24 guvenlik geregi .cmd'yi
   kabuksuz calistirmiyor (EINVAL), kabuk kapaliyken adi da bulunamiyor
   (ENOENT). Bu TEK cagri icin kabuk aciliyor; argumanlar sabit (dagitim
   URL'si ve kapsam adi), disaridan girdi yok. */
function calistirKabukla(satir) {
  return execFileSync(satir, { encoding: 'utf8', shell: true, windowsHide: true }).trim()
}

async function durum(url) {
  try {
    const c = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    return c.status
  } catch {
    return 0
  }
}

try {
  /* ---- 1. HEAD'in production dağıtımı ----
     "En son dağıtım" yetmez: push'tan hemen sonra Vercel yeni dağıtımı
     henüz kaydetmemiş olur ve betik bir öncekini taşırdı (2026-11-03). */
  const head = calistir('git', ['rev-parse', 'HEAD']).slice(0, 7)
  let son = null
  for (let i = 0; i < (BEKLE ? 20 : 1) && !son; i++) {
    son = ghJson(`repos/${DEPO}/deployments?per_page=10`)
      .filter((d) => d.environment === 'Production')
      .map((d) => ({ id: d.id, sha: String(d.sha).slice(0, 7), tarih: d.created_at }))
      .find((d) => d.sha === head) ?? null
    if (!son && BEKLE) {
      console.log(`  ${head} için dağıtım henüz yok — 15 sn sonra tekrar bakılacak`)
      await new Promise((r) => setTimeout(r, 15_000))
    }
  }
  if (!son) {
    console.error(`✗ ${head} için production dağıtımı bulunamadı (push edildi mi?)`)
    process.exit(1)
  }
  console.log(`Son production dağıtımı: ${son.sha} (${son.tarih})`)

  /* ---- 2. Durumu ve URL'si ---- */
  let url = null
  let deneme = 0
  const azamiDeneme = BEKLE ? 20 : 1

  while (deneme < azamiDeneme) {
    const durumlar = ghJson(`repos/${DEPO}/deployments/${son.id}/statuses`)
    const hal = durumlar[0]?.state ?? 'pending'
    const envUrl = durumlar[0]?.environment_url ?? ''

    if (hal === 'success' && envUrl) { url = envUrl; break }
    if (hal === 'failure' || hal === 'error') {
      console.error(`✗ Dağıtım başarısız (${hal}) — alias taşınmadı`)
      process.exit(1)
    }
    deneme++
    if (deneme < azamiDeneme) {
      console.log(`  dağıtım sürüyor (${hal}) — 15 sn sonra tekrar bakılacak [${deneme}/${azamiDeneme}]`)
      await new Promise((r) => setTimeout(r, 15_000))
    }
  }

  if (!url) {
    console.error('✗ Dağıtım henüz hazır değil. --bekle ile bekleyebilirsiniz.')
    process.exit(1)
  }
  console.log(`Dağıtım adresi: ${url}`)

  /* ---- 3. Alias zaten orada mı ---- */
  console.log(`\nAlias öncesi ${ALIAS}:`)
  const oncesi = {}
  for (const y of KANIT_YOLLAR) {
    oncesi[y] = await durum(`https://${ALIAS}${y}`)
    console.log(`  ${y.padEnd(26)} ${oncesi[y]}`)
  }
  const zatenGuncel = KANIT_YOLLAR.every((y) => oncesi[y] !== 404 && oncesi[y] !== 0)

  if (zatenGuncel) {
    console.log('\n✓ Alias zaten güncel görünüyor — yine de taşınacak (dağıtım değişmiş olabilir).')
  }

  if (KURU) {
    console.log(`\nKURU ÇALIŞMA — şu komut çalıştırılacaktı:`)
    for (const a of ALIASLAR) console.log(`  npx vercel alias set ${url} ${a} --scope ${KAPSAM}`)
    process.exit(0)
  }

  /* ---- 4. Taşı ---- */
  console.log(`\nAlias taşınıyor…`)
  for (const a of ALIASLAR) {
    const cikti = calistirKabukla(`npx vercel alias set ${url} ${a} --scope ${KAPSAM}`)
    const basari = cikti.split('\n').find((l) => l.includes('Success')) ?? cikti.split('\n')[0]
    console.log(`  ${basari.trim()}`)
  }

  /* ---- 5. DOĞRULA ---- */
  console.log(`\nAlias sonrası doğrulama:`)
  let kirik = 0
  for (const y of KANIT_YOLLAR) {
    const k = await durum(`https://${ALIAS}${y}`)
    const ok = k !== 404 && k !== 0
    if (!ok) kirik++
    console.log(`  ${ok ? 'OK   ' : 'KALDI'} ${y.padEnd(26)} ${k}`)
  }

  if (kirik > 0) {
    console.error(`\n✗ ${kirik} yol hâlâ 404 — alias taşındı ama beklenen derleme gelmedi.`)
    process.exit(1)
  }

  console.log(`\n✓ Yayında: https://${ALIAS}`)
  console.log('  Sol alttaki sürüm etiketinin beklediğiniz sürüm olduğunu doğrulayın —')
  console.log('  giriş sayfası sürümler arasında bayt-aynı olabiliyor, tek güvenilir dış işaret o.')
} catch (e) {
  console.error('✗ Hata:', e.message?.slice(0, 300) ?? e)
  process.exit(1)
}
