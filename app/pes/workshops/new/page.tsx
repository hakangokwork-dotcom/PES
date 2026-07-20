import WorkshopForm from '@/components/pes/WorkshopForm'
import Link from 'next/link'

export default function NewWorkshopPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/pes/workshops" className="text-sm text-gray-500 hover:text-gray-700">
          ← Atölyeler
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Yeni Atölye</h1>
        <p className="text-gray-500 mt-1">Yeni fason atölye kaydı oluşturun</p>
      </div>

      <WorkshopForm />
    </div>
  )
}
