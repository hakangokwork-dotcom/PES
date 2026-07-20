import WorkshopSidebar from '@/components/pes/WorkshopSidebar'

export default function WorkshopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <WorkshopSidebar />
      <main className="flex-1 min-w-0 p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
