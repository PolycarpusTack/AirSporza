import { api } from '../utils/api'
import type { Contract } from '../data/types'

export interface ContractWithRelations extends Contract {
  competition?: { name: string; sport?: { icon: string; name: string } }
  /** Flattened from competition.sport for convenience */
  sport?: { icon: string; name: string }
}

/** Flatten competition.sport to top-level sport for UI convenience */
function flattenSport<T extends { competition?: { sport?: { icon: string; name: string } }; sport?: unknown }>(contract: T): T {
  if (contract.competition?.sport && !contract.sport) {
    return { ...contract, sport: contract.competition.sport }
  }
  return contract
}

export const contractsApi = {
  list: async (status?: string) => {
    const params = status ? `?status=${status}` : ''
    const data = await api.get<ContractWithRelations[]>(`/contracts${params}`)
    return data.map(flattenSport)
  },

  expiring: async (days = 90) => {
    const data = await api.get<ContractWithRelations[]>(`/contracts/expiring?days=${days}`)
    return data.map(flattenSport)
  },

  get: async (id: number) => {
    const data = await api.get<ContractWithRelations>(`/contracts/${id}`)
    return flattenSport(data)
  },

  create: (data: Partial<Contract>) =>
    api.post<Contract>('/contracts', data),

  update: (id: number, data: Partial<Contract>) =>
    api.put<Contract>(`/contracts/${id}`, data)
}
