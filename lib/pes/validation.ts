import { z } from 'zod'

export const workshopCreateSchema = z.object({
  code: z.string().min(1, 'Kod zorunlu').max(20),
  name: z.string().min(1, 'Ad zorunlu').max(100),
  city: z.string().max(50).nullable().optional(),
  district: z.string().max(50).nullable().optional(),
  type: z.enum(['CMT', 'CM', 'MT', 'M'], { message: 'Tip CMT, CM, MT veya M olmalı' }),
  total_staff: z.number().int().min(0).default(0),
  sewing_staff: z.number().int().min(0).default(0),
  ukp_staff: z.number().int().min(0).default(0),
  cutting_staff: z.number().int().min(0).default(0),
  management: z.number().int().min(0).default(0),
  indirect: z.number().int().min(0).default(0),
  line_count: z.number().int().min(0).max(50).default(0),
  daily_target: z.number().int().min(0).default(0),
  net_hours_day: z.number().min(1).max(24).default(9),
})

export const workshopUpdateSchema = workshopCreateSchema.partial()

export const lineCreateSchema = z.object({
  code: z.string().min(1, 'Kod zorunlu').max(30),
  workshop_id: z.number().int().positive(),
  name: z.string().min(1, 'Ad zorunlu').max(50),
  line_type: z.enum(['Dikim', 'Kesim', 'UKP', 'Yikama']).default('Dikim'),
  operator_count: z.number().int().min(0).default(0),
  daily_target: z.number().int().min(0).default(0),
  max_cycle_sec: z.number().min(0).nullable().optional(),
})

export const lineUpdateSchema = lineCreateSchema.partial().omit({ workshop_id: true })
