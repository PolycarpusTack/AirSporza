import { api } from '../utils/api'

/**
 * RC-1-T2 — Listed Events (evenementen van aanzienlijk belang, besluit 28 May 2004).
 * Category catalog is admin-editable (AS-3 — a correction is a data edit, no deploy).
 * Suggestions NEVER auto-bind; a human confirms/dismisses an event's category link.
 */
export interface ListedEventCategory {
  id: number
  tenantId: string
  name: string
  sportId: number
  fullLiveRequired: boolean
  besluitRef: string | null
  createdAt: string
  updatedAt: string
}

/** Admin-editable fields (AS-3). */
export type ListedEventCategoryInput = Partial<Pick<ListedEventCategory, 'name' | 'fullLiveRequired' | 'besluitRef'>>

/** An event with its (nullable) confirmed listed-category link. */
export interface EventListedCategoryLink {
  id: number
  listedCategoryId: number | null
}

export const listedEventsApi = {
  listCategories: () =>
    api.get<ListedEventCategory[]>('/listed-events/categories'),

  updateCategory: (id: number, data: ListedEventCategoryInput) =>
    api.put<ListedEventCategory>(`/listed-events/categories/${id}`, data),

  /** Read-only suggestions for an event (never binds). */
  suggest: (eventId: number) =>
    api.get<ListedEventCategory[]>(`/listed-events/events/${eventId}/suggest`),

  /** Bind a category to the event (idempotent by eventId). */
  confirm: (eventId: number, categoryId: number) =>
    api.post<EventListedCategoryLink>(`/listed-events/events/${eventId}/confirm`, { categoryId }),

  /** Clear the event's category link (idempotent). */
  dismiss: (eventId: number) =>
    api.post<EventListedCategoryLink>(`/listed-events/events/${eventId}/dismiss`),
}
