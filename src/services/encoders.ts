import { api } from '../utils/api'

export interface Encoder {
  id: number
  name: string
  location: string | null
  isActive: boolean
  notes: string | null
  inUse: {
    planId: number
    planType: string
    eventId: number
  } | null
}

export const encodersApi = {
  list: () =>
    api.get<Encoder[]>('/encoders'),

  create: (data: { name: string; location?: string; notes?: string }) =>
    api.post<Encoder>('/encoders', data),

  update: (id: number, data: Partial<Encoder>) =>
    api.put<Encoder>(`/encoders/${id}`, data)
}
