import { useCallback, useRef } from 'react'
import { eventsApi } from '../services'
import { isEventLocked, isForwardTransition, lockReasonLabel } from '../utils/eventLock'
import { handleApiError } from '../utils/apiError'
import { useToast } from '../components/Toast'
import type { ConfirmOptions } from '../components/ui/ConfirmDialog'
import type { Event, EventStatus } from '../data/types'

interface UseEventActionsParams {
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>
  freezeHours: number
  userRole?: string
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

function pickEventFields(e: Event) {
  return {
    sportId: e.sportId, competitionId: e.competitionId, phase: e.phase,
    category: e.category, participants: e.participants, content: e.content,
    startDateBE: e.startDateBE, startTimeBE: e.startTimeBE,
    startDateOrigin: e.startDateOrigin, startTimeOrigin: e.startTimeOrigin,
    complex: e.complex, livestreamDate: e.livestreamDate, livestreamTime: e.livestreamTime,
    channelId: e.channelId, radioChannelId: e.radioChannelId, onDemandChannelId: e.onDemandChannelId,
    linearChannel: e.linearChannel, radioChannel: e.radioChannel, onDemandChannel: e.onDemandChannel,
    linearStartTime: e.linearStartTime, isLive: e.isLive, isDelayedLive: e.isDelayedLive,
    videoRef: e.videoRef, winner: e.winner, score: e.score, duration: e.duration,
    customFields: e.customFields,
  }
}

export function useEventActions({ setEvents, freezeHours, userRole, confirm }: UseEventActionsParams) {
  const toast = useToast()
  const clipboardRef = useRef<Event | null>(null)

  const handleCtxStatusChange = useCallback(async (event: Event, status: EventStatus) => {
    const currentStatus = (event.status ?? 'draft') as EventStatus
    const forward = isForwardTransition(currentStatus, status)
    // Forward transitions bypass lock
    if (!forward) {
      const lock = isEventLocked(event, freezeHours, userRole)
      if (lock.locked && !lock.canOverride) {
        toast.warning('This event is locked and cannot be changed')
        return
      }
      if (lock.locked && lock.canOverride) {
        const ok = await confirm({
          title: 'Override lock',
          message: `This event is locked (${lockReasonLabel(lock)}). Changes may disrupt operations. Continue?`,
          variant: 'warning',
          confirmLabel: 'Continue',
        })
        if (!ok) return
      }
    }
    try {
      await eventsApi.update(event.id, { ...event, status })
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, status } : e))
      toast.success(`Status changed to ${status}`)
    } catch (err) {
      handleApiError(err, 'Failed to update status', toast)
    }
  }, [setEvents, toast, freezeHours, userRole, confirm])

  const handleCtxDelete = useCallback(async (event: Event) => {
    const lock = isEventLocked(event, freezeHours, userRole)
    if (lock.locked && !lock.canOverride) {
      toast.warning('This event is locked and cannot be deleted')
      return
    }
    if (lock.locked && lock.canOverride) {
      const ok = await confirm({
        title: 'Override lock',
        message: `This event is locked (${lockReasonLabel(lock)}). Changes may disrupt operations. Continue?`,
        variant: 'warning',
        confirmLabel: 'Continue',
      })
      if (!ok) return
    }
    const ok = await confirm({
      title: 'Delete event',
      message: `Delete "${event.participants}"? This cannot be undone.`,
      variant: 'danger',
    })
    if (!ok) return
    try {
      await eventsApi.delete(event.id)
      setEvents(prev => prev.filter(e => e.id !== event.id))
      toast.success('Event deleted')
    } catch (err) {
      handleApiError(err, 'Failed to delete event', toast)
    }
  }, [setEvents, toast, freezeHours, userRole, confirm])

  const handleCtxDuplicate = useCallback(async (event: Event, targetDate: string) => {
    try {
      const created = await eventsApi.create({
        ...pickEventFields(event),
        startDateBE: targetDate,
        status: 'draft' as EventStatus,
      }) as Event
      setEvents(prev => [...prev, created])
      clipboardRef.current = created
      const label = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
      })
      toast.success(`Duplicated to ${label}`)
    } catch (err) {
      handleApiError(err, 'Failed to duplicate event', toast)
    }
  }, [setEvents, toast])

  const handleCtxPaste = useCallback(async (date: string, time?: string) => {
    const src = clipboardRef.current
    if (!src) return
    try {
      const created = await eventsApi.create({
        ...pickEventFields(src),
        startDateBE: date,
        ...(time ? { startTimeBE: time, linearStartTime: time } : {}),
        status: 'draft' as EventStatus,
      }) as Event
      setEvents(prev => [...prev, created])
      toast.success('Pasted event')
    } catch (err) {
      handleApiError(err, 'Failed to paste event', toast)
    }
  }, [setEvents, toast])

  return {
    handleCtxStatusChange,
    handleCtxDelete,
    handleCtxDuplicate,
    handleCtxPaste,
    clipboardRef,
  }
}
