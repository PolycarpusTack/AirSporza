import { z } from 'zod'

export const notificationIdParam = z.object({
  id: z.string().min(1),
})
