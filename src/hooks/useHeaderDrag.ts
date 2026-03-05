import { useState, useRef, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface HeaderDragState {
  selectedIndices: number[];   // 0-6 for Mon-Sun
  selectedDates: string[];     // YYYY-MM-DD strings
  active: boolean;             // true while dragging headers, false when waiting for time draw
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Manages horizontal pointer drag across day column headers for multi-day
 * selection. After 2+ headers are selected, the hook enters "time pick" mode
 * (active=false) so the user can draw a time block with useDrawToCreate.
 */
export function useHeaderDrag(
  weekDays: Date[],
  dateStr: (d: Date) => string,
) {
  const [headerState, setHeaderState] = useState<HeaderDragState | null>(null);
  const stateRef = useRef<HeaderDragState | null>(null);

  // Anchor index (the column where the drag started)
  const anchorRef = useRef<number | null>(null);

  const updateState = useCallback((s: HeaderDragState | null) => {
    stateRef.current = s;
    setHeaderState(s);
  }, []);

  /* ---- helpers ---- */

  const buildState = useCallback(
    (from: number, to: number, active: boolean): HeaderDragState => {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      const indices: number[] = [];
      for (let i = lo; i <= hi; i++) indices.push(i);
      return {
        selectedIndices: indices,
        selectedDates: indices.map((i) => dateStr(weekDays[i])),
        active,
      };
    },
    [weekDays, dateStr],
  );

  /* ---- pointer down on a header ---- */
  const onHeaderPointerDown = useCallback(
    (dayIdx: number, e: React.PointerEvent) => {
      // Capture pointer for reliable tracking even if cursor leaves element
      (e.target as Element).setPointerCapture(e.pointerId);

      anchorRef.current = dayIdx;
      updateState({
        selectedIndices: [dayIdx],
        selectedDates: [dateStr(weekDays[dayIdx])],
        active: true,
      });
    },
    [weekDays, dateStr, updateState],
  );

  /* ---- pointer move over a header ---- */
  const onHeaderPointerMove = useCallback(
    (dayIdx: number) => {
      if (anchorRef.current === null) return;
      updateState(buildState(anchorRef.current, dayIdx, true));
    },
    [buildState, updateState],
  );

  /* ---- pointer up ---- */
  const onHeaderPointerUp = useCallback((): string[] | null => {
    if (anchorRef.current === null) return null;
    anchorRef.current = null;

    const prev = stateRef.current;
    if (!prev || prev.selectedIndices.length < 2) {
      updateState(null);
      return null;
    }
    // 2+ headers selected — enter time-pick mode (active=false)
    updateState({ ...prev, active: false });
    return prev.selectedDates;
  }, [updateState]);

  /* ---- cancel ---- */
  const cancel = useCallback(() => {
    anchorRef.current = null;
    updateState(null);
  }, [updateState]);

  /* ---- confirm (called after time draw completes) ---- */
  const confirm = useCallback((): string[] => {
    const prev = stateRef.current;
    const dates = prev?.selectedDates ?? [];
    anchorRef.current = null;
    updateState(null);
    return dates;
  }, [updateState]);

  return { headerState, onHeaderPointerDown, onHeaderPointerMove, onHeaderPointerUp, cancel, confirm } as const;
}
