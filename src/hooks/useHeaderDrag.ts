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

  // Anchor index (the column where the drag started)
  const anchorRef = useRef<number | null>(null);

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
      setHeaderState({
        selectedIndices: [dayIdx],
        selectedDates: [dateStr(weekDays[dayIdx])],
        active: true,
      });
    },
    [weekDays, dateStr],
  );

  /* ---- pointer move over a header ---- */
  const onHeaderPointerMove = useCallback(
    (dayIdx: number) => {
      if (anchorRef.current === null) return;
      setHeaderState(buildState(anchorRef.current, dayIdx, true));
    },
    [buildState],
  );

  /* ---- pointer up ---- */
  const onHeaderPointerUp = useCallback((): string[] | null => {
    const anchor = anchorRef.current;
    if (anchor === null) return null;

    let result: string[] | null = null;

    setHeaderState((prev) => {
      if (!prev || prev.selectedIndices.length < 2) {
        // Single header click — cancel
        return null;
      }
      // 2+ headers selected — enter time-pick mode (active=false)
      result = prev.selectedDates;
      return { ...prev, active: false };
    });

    anchorRef.current = null;
    return result;
  }, []);

  /* ---- cancel ---- */
  const cancel = useCallback(() => {
    anchorRef.current = null;
    setHeaderState(null);
  }, []);

  /* ---- confirm (called after time draw completes) ---- */
  const confirm = useCallback((): string[] => {
    let dates: string[] = [];

    setHeaderState((prev) => {
      if (prev) dates = prev.selectedDates;
      return null;
    });

    anchorRef.current = null;
    return dates;
  }, []);

  return { headerState, onHeaderPointerDown, onHeaderPointerMove, onHeaderPointerUp, cancel, confirm } as const;
}
