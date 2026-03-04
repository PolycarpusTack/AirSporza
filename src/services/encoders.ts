import { api } from '../utils/api'
import type { Encoder } from '../data/types'

export type { Encoder }

export const encodersApi = {
  list: () =>
    api.get<Encoder[]>('/encoders'),

  create: (data: { name: string; location?: string; notes?: string; isActive?: boolean }) =>
    api.post<Encoder>('/encoders', data),

  update: (id: number, data: Partial<Pick<Encoder, 'name' | 'location' | 'notes' | 'isActive'>>) =>
    api.put<Encoder>(`/encoders/${id}`, data),
}
