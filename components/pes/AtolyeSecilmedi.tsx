import { EmptyState, LinkButton } from '@/components/ui'

/* Atölye paneline atölye seçilmeden girildiğinde (yalnız merkez yöneticisi;
   atölye hesabında atölye oturumdan gelir). Eskiden on beş ekran düz
   "Atölye seçin" yazıp duruyordu; çıkış yolu yoktu. */
export default function AtolyeSecilmedi() {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <EmptyState
        title="Önce bir atölye seçin"
        description="Atölye paneli tek bir atölye adına çalışır. Listeden atölyeyi seçtiğinizde bu ekran o atölyenin verisiyle açılır."
        action={<LinkButton href="/workshop" size="sm" variant="primary">Atölye listesine git</LinkButton>}
      />
    </div>
  )
}
