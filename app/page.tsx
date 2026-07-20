import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="w-16 h-16 bg-[#197A56] rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-white font-bold text-xl">PES</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Atölye Verimlilik Sistemi</h1>
        <p className="text-gray-500 max-w-md">
          200 fason atölye için verimlilik değerlendirme, maliyet analizi ve tedarikçi skorlama sistemi.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/workshop"
            className="px-6 py-2.5 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] transition-colors font-medium text-sm"
          >
            Atölye Paneli
          </Link>
          <Link
            href="/pes"
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
          >
            Merkez Paneli
          </Link>
        </div>
      </div>
    </div>
  )
}
