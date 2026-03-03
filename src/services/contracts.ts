import { api } from '../utils/api'
import type { Contract } from '../data/types'

export const contractsApi = {
  list: (status?: string) => {
    const params = status ? `?status=${status}` : ''
    return api.get<(Contract & { competition: { name: string }; sport: { icon: string; name: string } })[]>(`/contracts${params}`)
  },

  expiring: (days = 90) =>
    api.get<(Contract & { competition: { name: string }; sport: { icon: string } })[]>(`/contracts/expiring?days=${days}`),

  get: (id: number) =>
    api.get<Contract & { competition: { name: string }; sport: { icon: string; name: string } }>(`/contracts/${id}`),

  create: (data: Partial<Contract>) =>
    api.post<Contract>('/contracts', data),

  update: (id: number, data: Partial<Contract>) =>
    api.put<Contract>(`/contracts/${id}`, data)
}
