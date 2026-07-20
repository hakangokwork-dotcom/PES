import Link from 'next/link'
import ExpenseImport from '@/components/pes/ExpenseImport'

export const metadata = { title: 'Gider Beyanı İçe Aktar' }

export default function ExpenseImportPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/pes/veri-kalitesi" className="text-sm text-gray-500 hover:text-gray-700">
          ← Veri Kalitesi
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Gider Beyanı İçe Aktar</h1>
        <p className="text-gray-500 mt-1">
          Atölye gider beyanlarını toplu yükleyin. Yüklenen her satır güven skoruyla
          değerlendirilir; ham veri denetim izi olarak saklanır.
        </p>
      </div>

      <ExpenseImport />
    </div>
  )
}
