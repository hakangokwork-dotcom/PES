import PesDevSidebar from '@/components/pes/PesDevSidebar'

export default function PesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <PesDevSidebar />
      <main className="flex-1 min-w-0 p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
