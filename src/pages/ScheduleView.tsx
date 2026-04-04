import { useState, useEffect, useCallback, useMemo } from 'react'
import { ScheduleGrid } from '../components/schedule/ScheduleGrid'
import { ScheduleToolbar } from '../components/schedule/ScheduleToolbar'
import { SlotEditorPanel } from '../components/schedule/SlotEditorPanel'
import { SlotContextMenu } from '../components/schedule/SlotContextMenu'
import { SwitchConfirmModal } from '../components/schedule/SwitchConfirmModal'
import { CascadeDashboard } from '../components/schedule/CascadeDashboard'
import { schedulesApi } from '../services/schedules'
import { channelsApi } from '../services/channels'
import { useScheduleEditor } from '../hooks/useScheduleEditor'
import { useSlotDrag, type DragResult } from '../hooks/useSlotDrag'
import { useSlotContextMenu } from '../hooks/useSlotContextMenu'
import { useToast } from '../components/Toast'
import type { Channel, BroadcastSlot, ScheduleDraft, Alert } from '../data/types'
import { Grid2X2, Activity } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ScheduleView() {
  const toast = useToast()

  /* ---------- data state ---------- */
  const [channels, setChannels] = useState<Channel[]>([])
  const [baseSlots, setBaseSlots] = useState<BroadcastSlot[]>([])
  const [drafts, setDrafts] = useState<ScheduleDraft[]>([])
  const [activeDraft, setActiveDraft] = useState<ScheduleDraft | null>(null)

  /* ---------- UI state ---------- */
  const [date, setDate] = useState(todayStr)
  const [timezone, setTimezone] = useState('UTC')
  const [activeTab, setActiveTab] = useState<'grid' | 'cascade'>('grid')
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [switchAlert, setSwitchAlert] = useState<Alert | null>(null)

  /* ---------- hooks ---------- */
  const editor = useScheduleEditor(activeDraft, baseSlots)
  const { menu, openMenu, closeMenu } = useSlotContextMenu()

  const handleDragComplete = useCallback((result: DragResult) => {
    const slot = editor.computedSlots.find(s => s.id === result.slotId)
    if (!slot) return

    if (result.type === 'resize') {
      const oldEnd = new Date(slot.plannedEndUtc ?? slot.plannedStartUtc ?? Date.now()).getTime()
      const newEnd = new Date(oldEnd + result.deltaMinutes * 60_000).toISOString()
      editor.dispatch({ type: 'RESIZE_SLOT', slotId: result.slotId, newEndUtc: newEnd })
    } else {
      const oldStart = new Date(slot.plannedStartUtc ?? Date.now()).getTime()
      const oldEnd = new Date(slot.plannedEndUtc ?? slot.plannedStartUtc ?? Date.now()).getTime()
      const deltaMs = result.deltaMinutes * 60_000
      editor.dispatch({
        type: 'MOVE_SLOT',
        slotId: result.slotId,
        newChannelId: result.newChannelId,
        newStartUtc: new Date(oldStart + deltaMs).toISOString(),
        newEndUtc: new Date(oldEnd + deltaMs).toISOString(),
      })
    }
  }, [editor])

  const { startDrag } = useSlotDrag(handleDragComplete)

  /* ---------- data fetching ---------- */
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [ch, sl, dr] = await Promise.all([
        channelsApi.list(),
        schedulesApi.listSlots({ date }),
        schedulesApi.listDrafts(),
      ])
      setChannels(ch)
      setBaseSlots(sl)
      setDrafts(dr)
      if (dr.length) {
        setActiveDraft(prev => {
          // Keep current selection if it still exists in the new list
          if (prev && dr.some(d => d.id === prev.id)) return prev
          return dr.find(d => d.status !== 'PUBLISHED') || dr[0]
        })
      } else {
        setActiveDraft(null)
      }
      editor.reset()
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to load schedule data')
    } finally {
      setLoading(false)
    }
  }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  /* ---------- validation / publish ---------- */
  const handleValidate = useCallback(async () => {
    setValidating(true)
    try {
      await editor.validate()
    } finally {
      setValidating(false)
    }
  }, [editor])

  const handlePreviewCascade = useCallback(async () => {
    if (!activeDraft) return
    setPreviewing(true)
    try {
      const result = await schedulesApi.previewCascade(activeDraft.id)
      const totalEstimates = result.courts.reduce((sum, c) => sum + c.estimates.length, 0)
      if (result.courts.length === 0) {
        toast.info('No cascade impact — no pending operations')
      } else {
        toast.success(`Cascade preview: ${totalEstimates} slot(s) across ${result.courts.length} court(s)`)
        // Log details for V1 — a dedicated panel can be added later
        console.info('[Cascade Preview]', result)
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to preview cascade')
    } finally {
      setPreviewing(false)
    }
  }, [activeDraft, toast])

  const handleCreateDraft = useCallback(async () => {
    if (!channels.length) return
    try {
      const newDraft = await schedulesApi.createDraft({
        channelId: channels[0].id,
        dateRangeStart: date,
        dateRangeEnd: date,
      })
      // Refetch all drafts and select the new one
      const dr = await schedulesApi.listDrafts()
      setDrafts(dr)
      setActiveDraft(newDraft)
      editor.reset()
      toast.success('New draft created')
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to create draft')
    }
  }, [channels, date, editor, toast])

  const handleSelectDraft = useCallback((draft: ScheduleDraft) => {
    setActiveDraft(draft)
    editor.reset()
  }, [editor])

  const handlePublish = useCallback(async () => {
    setPublishing(true)
    try {
      await editor.publish()
      await fetchData()
    } finally {
      setPublishing(false)
    }
  }, [editor, fetchData])

  /* ---------- grid callbacks ---------- */
  const handleSlotClick = useCallback((slotId: string) => {
    editor.setSelectedSlotId(slotId)
  }, [editor])

  const handleSlotDoubleClick = useCallback((slotId: string) => {
    editor.setSelectedSlotId(slotId)
  }, [editor])

  const handleSlotContextMenu = useCallback((e: React.MouseEvent, slotId: string) => {
    openMenu(e, slotId)
  }, [openMenu])

  const handleSlotDragStart = useCallback((e: React.MouseEvent, slotId: string, type: 'move' | 'resize') => {
    const slot = editor.computedSlots.find(s => s.id === slotId)
    if (!slot) return

    const target = e.currentTarget as HTMLElement
    const column = target.closest('[data-channel-column]') as HTMLElement | null
    const grid = target.closest('[data-schedule-grid]') as HTMLElement | null

    const channelIds = channels.map(c => c.id)
    const channelWidth = column?.offsetWidth ?? 140
    const gridLeft = grid?.getBoundingClientRect().left ?? 0

    startDrag(e, slotId, type, slot.channelId, channelIds, channelWidth, gridLeft, target)
  }, [editor.computedSlots, channels, startDrag])

  const handleEmptyClick = useCallback((channelId: number, hour: number) => {
    const hh = Math.floor(hour) % 24
    const mm = Math.round((hour - Math.floor(hour)) * 60)
    const baseDate = date
    const start = new Date(Date.UTC(
      Number(baseDate.slice(0, 4)),
      Number(baseDate.slice(5, 7)) - 1,
      Number(baseDate.slice(8, 10)),
      hh,
      mm,
    ))
    const end = new Date(start.getTime() + 2 * 60 * 60_000) // 2h default

    editor.dispatch({
      type: 'CREATE_SLOT',
      data: {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        channelId,
        plannedStartUtc: start.toISOString(),
        plannedEndUtc: end.toISOString(),
        status: 'TENTATIVE' as BroadcastSlot['status'],
        schedulingMode: 'FIXED' as BroadcastSlot['schedulingMode'],
        overrunStrategy: 'EXTEND' as BroadcastSlot['overrunStrategy'],
        bufferBeforeMin: 15,
        bufferAfterMin: 10,
        expectedDurationMin: 120,
      },
    })
  }, [date, editor])

  /* ---------- context-menu actions ---------- */
  const handleContextEdit = useCallback(() => {
    if (menu) {
      editor.setSelectedSlotId(menu.slotId)
      closeMenu()
    }
  }, [menu, editor, closeMenu])

  const handleContextDelete = useCallback(() => {
    if (menu) {
      editor.dispatch({ type: 'DELETE_SLOT', slotId: menu.slotId })
      closeMenu()
    }
  }, [menu, editor, closeMenu])

  const handleContextDuplicate = useCallback(() => {
    if (!menu) return
    const slot = editor.computedSlots.find(s => s.id === menu.slotId)
    if (!slot) return
    const endTime = slot.plannedEndUtc
      ? new Date(new Date(slot.plannedEndUtc).getTime() + 30 * 60_000).toISOString()
      : new Date().toISOString()
    editor.dispatch({
      type: 'DUPLICATE_SLOT',
      sourceSlotId: menu.slotId,
      newChannelId: slot.channelId,
      newStartUtc: endTime,
    })
    closeMenu()
  }, [menu, editor, closeMenu])

  const handleContextCopyTime = useCallback(() => {
    if (!menu) return
    const slot = editor.computedSlots.find(s => s.id === menu.slotId)
    if (!slot) return
    const start = slot.plannedStartUtc ? new Date(slot.plannedStartUtc).toLocaleTimeString() : '--'
    const end = slot.plannedEndUtc ? new Date(slot.plannedEndUtc).toLocaleTimeString() : '--'
    navigator.clipboard.writeText(`${start} - ${end}`)
    toast.success('Time copied to clipboard')
    closeMenu()
  }, [menu, editor.computedSlots, toast, closeMenu])

  /* ---------- keyboard shortcuts ---------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Do not intercept when user is typing in inputs
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        editor.undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        editor.redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editor.selectedSlotId) {
          e.preventDefault()
          editor.dispatch({ type: 'DELETE_SLOT', slotId: editor.selectedSlotId })
          editor.setSelectedSlotId(null)
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        if (editor.selectedSlotId) {
          e.preventDefault()
          const slot = editor.computedSlots.find(s => s.id === editor.selectedSlotId)
          if (slot) {
            const newStart = slot.plannedEndUtc
              ? new Date(new Date(slot.plannedEndUtc).getTime() + 30 * 60_000).toISOString()
              : new Date().toISOString()
            editor.dispatch({
              type: 'DUPLICATE_SLOT',
              sourceSlotId: editor.selectedSlotId,
              newChannelId: slot.channelId,
              newStartUtc: newStart,
            })
          }
        }
      } else if (e.key === 'Escape') {
        editor.setSelectedSlotId(null)
        closeMenu()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editor, closeMenu])

  /* ---------- derived ---------- */
  const validationBySlotMap = useMemo(() => {
    const map = new Map<string, import('../hooks/useScheduleEditor').ValidationResult[]>()
    for (const [slotId, results] of Object.entries(editor.validationBySlot)) {
      map.set(slotId, results)
    }
    return map
  }, [editor.validationBySlot])

  /* ---------- render ---------- */
  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold font-head">Schedule</h1>
          <p className="text-xs text-text-3 mt-0.5">Broadcast schedule grid — channels x time</p>
        </div>
        <div className="flex gap-1 border border-border rounded-lg p-0.5 bg-surface-2 w-fit">
          <button
            onClick={() => setActiveTab('grid')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'grid' ? 'bg-surface text-text shadow-sm' : 'text-text-3 hover:text-text-2'
            }`}
          >
            <Grid2X2 className="w-3.5 h-3.5" /> Grid
          </button>
          <button
            onClick={() => setActiveTab('cascade')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'cascade' ? 'bg-surface text-text shadow-sm' : 'text-text-3 hover:text-text-2'
            }`}
          >
            <Activity className="w-3.5 h-3.5" /> Cascade
          </button>
        </div>
      </div>

      {/* Grid tab */}
      {activeTab === 'grid' && (
        <>
          <ScheduleToolbar
            date={date}
            onPrevDay={() => setDate(shiftDate(date, -1))}
            onNextDay={() => setDate(shiftDate(date, 1))}
            onToday={() => setDate(todayStr())}
            onDateChange={setDate}
            timezone={timezone}
            onTimezoneChange={setTimezone}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            onUndo={editor.undo}
            onRedo={editor.redo}
            draft={activeDraft}
            drafts={drafts}
            onCreateDraft={handleCreateDraft}
            onSelectDraft={handleSelectDraft}
            operationCount={editor.operations.length}
            onPreviewCascade={handlePreviewCascade}
            onValidate={handleValidate}
            onPublish={handlePublish}
            previewing={previewing}
            validating={validating}
            publishing={publishing}
            createDraftDisabled={channels.length === 0}
          />

          {loading ? (
            <div className="h-96 bg-surface-2 rounded-xl animate-pulse" />
          ) : channels.length === 0 ? (
            <div className="text-center py-20 text-text-3">
              <p className="text-sm">No channels configured yet.</p>
              <p className="text-xs mt-1">Add channels in Settings &rarr; Organisation</p>
            </div>
          ) : (
            <ScheduleGrid
              channels={channels}
              slots={editor.computedSlots}
              selectedSlotId={editor.selectedSlotId}
              validationBySlot={validationBySlotMap}
              onSlotClick={handleSlotClick}
              onSlotDoubleClick={handleSlotDoubleClick}
              onSlotContextMenu={handleSlotContextMenu}
              onSlotDragStart={handleSlotDragStart}
              onEmptyClick={handleEmptyClick}
            />
          )}
        </>
      )}

      {/* Cascade tab */}
      {activeTab === 'cascade' && (
        <CascadeDashboard
          date={date}
          onDateChange={setDate}
          onSwitchAction={setSwitchAlert}
        />
      )}

      {/* Slot editor side panel */}
      {editor.selectedSlot && (
        <SlotEditorPanel
          slot={editor.selectedSlot}
          validations={validationBySlotMap.get(editor.selectedSlotId!) || []}
          onDispatch={editor.dispatch}
          onDelete={(slotId) => {
            editor.dispatch({ type: 'DELETE_SLOT', slotId })
            editor.setSelectedSlotId(null)
          }}
          onClose={() => editor.setSelectedSlotId(null)}
        />
      )}

      {/* Context menu */}
      {menu && (
        <SlotContextMenu
          x={menu.x}
          y={menu.y}
          onEdit={handleContextEdit}
          onDelete={handleContextDelete}
          onDuplicate={handleContextDuplicate}
          onCopyTime={handleContextCopyTime}
        />
      )}

      {/* Channel switch confirmation modal */}
      {switchAlert && (
        <SwitchConfirmModal
          alert={switchAlert}
          onClose={() => setSwitchAlert(null)}
          onConfirmed={fetchData}
        />
      )}
    </div>
  )
}
