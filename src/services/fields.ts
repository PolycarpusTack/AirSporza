import { api } from '../utils/api'
import type { FieldDefinition, DropdownList, DropdownOption, MandatoryFieldConfig, FieldSection } from '../data/types'

export type { FieldSection }

export const fieldsApi = {
  list: (section?: FieldSection) =>
    api.get<FieldDefinition[]>(`/fields${section ? `?section=${section}` : ''}`),

  create: (data: {
    name: string
    label: string
    fieldType: string
    section: FieldSection
    required?: boolean
    visible?: boolean
    sortOrder?: number
    options?: string
  }) =>
    api.post<FieldDefinition>('/fields', data),

  update: (id: string, data: Partial<{
    label: string
    required: boolean
    visible: boolean
    sortOrder: number
    options: string
  }>) =>
    api.put<FieldDefinition>(`/fields/${id}`, data),

  delete: (id: string) =>
    api.delete<{ message: string }>(`/fields/${id}`),

  reorder: (items: { id: string; sortOrder: number }[]) =>
    api.put<{ message: string }>('/fields/order', items),

  listDropdowns: () =>
    api.get<DropdownList[]>('/fields/dropdowns'),

  createDropdown: (data: { id: string; name: string; description?: string }) =>
    api.post<DropdownList>('/fields/dropdowns', data),

  createDropdownOption: (listId: string, data: { label: string; value: string }) =>
    api.post<DropdownOption>(`/fields/dropdowns/${listId}/options`, data),

  getMandatory: (sportId: number) =>
    api.get<MandatoryFieldConfig>(`/fields/mandatory/${sportId}`),

  setMandatory: (sportId: number, data: { fieldIds: string[] }) =>
    api.put<MandatoryFieldConfig>(`/fields/mandatory/${sportId}`, data),
}
