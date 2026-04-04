import { useRef, useEffect, useCallback } from 'react'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const SNAP_MINUTES = 5
export const PX_PER_HOUR = 30
export const PX_PER_MINUTE = PX_PER_HOUR / 60
export const SNAP_PX = SNAP_MINUTES * PX_PER_MINUTE // 2.5

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DragResult {
  slotId: string
  type: 'move' | 'resize'
  deltaMinutes: number
  newChannelId?: number
}

interface DragState {
  active: boolean
  slotId: string
  type: 'move' | 'resize'
  startY: number
  startX: number
  originalChannelId: number
  channelIds: number[]
  channelWidth: number
  gridLeft: number
  ghostEl: HTMLElement | null
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function snapPx(px: number): number {
  return Math.round(px / SNAP_PX) * SNAP_PX
}

function pxToMinutes(px: number): number {
  return Math.round((px / PX_PER_HOUR) * 60 / SNAP_MINUTES) * SNAP_MINUTES
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useSlotDrag(onComplete: (result: DragResult) => void) {
  const stateRef = useRef<DragState>({
    active: false,
    slotId: '',
    type: 'move',
    startY: 0,
    startX: 0,
    originalChannelId: 0,
    channelIds: [],
    channelWidth: 0,
    gridLeft: 0,
    ghostEl: null,
  })

  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const startDrag = useCallback((
    e: React.MouseEvent | MouseEvent,
    slotId: string,
    type: 'move' | 'resize',
    channelId: number,
    channelIds: number[],
    channelWidth: number,
    gridLeft: number,
    ghostEl: HTMLElement,
  ) => {
    e.preventDefault()
    stateRef.current = {
      active: true,
      slotId,
      type,
      startY: e.clientY,
      startX: e.clientX,
      originalChannelId: channelId,
      channelIds,
      channelWidth,
      gridLeft,
      ghostEl,
    }
    document.body.style.cursor = type === 'resize' ? 'ns-resize' : 'grabbing'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const s = stateRef.current
      if (!s.active || !s.ghostEl) return

      const deltaY = e.clientY - s.startY
      const snappedY = snapPx(deltaY)

      // Apply vertical translation to ghost
      s.ghostEl.style.transform = `translateY(${snappedY}px)`
    }

    const onMouseUp = (e: MouseEvent) => {
      const s = stateRef.current
      if (!s.active) return

      const deltaY = e.clientY - s.startY
      const deltaMinutes = pxToMinutes(deltaY)

      // Compute channel change from horizontal delta (move only)
      let newChannelId: number | undefined
      if (s.type === 'move' && s.channelIds.length > 1) {
        const deltaX = e.clientX - s.startX
        const colShift = Math.round(deltaX / s.channelWidth)
        if (colShift !== 0) {
          const currentIdx = s.channelIds.indexOf(s.originalChannelId)
          const targetIdx = Math.max(0, Math.min(s.channelIds.length - 1, currentIdx + colShift))
          const targetId = s.channelIds[targetIdx]
          if (targetId !== s.originalChannelId) {
            newChannelId = targetId
          }
        }
      }

      // Reset ghost
      if (s.ghostEl) {
        s.ghostEl.style.transform = ''
      }
      document.body.style.cursor = ''

      // Fire callback if there was actual movement
      if (deltaMinutes !== 0 || newChannelId != null) {
        onCompleteRef.current({
          slotId: s.slotId,
          type: s.type,
          deltaMinutes,
          newChannelId,
        })
      }

      // Reset state
      stateRef.current = {
        ...stateRef.current,
        active: false,
        ghostEl: null,
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return { startDrag }
}
