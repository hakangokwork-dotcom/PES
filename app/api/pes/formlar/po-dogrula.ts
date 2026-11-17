import type postgres from 'postgres'

/** PO, formun atölyesine ait olmalı. FK kontrolü RLS'i atlar; bu sorgu atlamaz. */
export async function poDogrula(sql: postgres.TransactionSql, workOrderId: number | null, workshopId: number) {
  if (workOrderId == null) return null
  const [wo] = await sql`SELECT workshop_id FROM work_order WHERE id = ${workOrderId}`
  return wo && wo.workshop_id === workshopId ? null : 'Sipariş bu atölyeye ait değil'
}
