import { useState, useRef, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface DrawState {
  date: string;        // YYYY-MM-DD
  startMin: number;    // minutes from midnight
  endMin: number;      // minutes from midnight
  active: boolean;     // currently dragging
}

export interface DrawResult {
  date: string;
  startTime: string;   // HH:MM
  durationMinutes: number;
}

export interface UseDrawToCreateOptions {
  calStartHour: number; // e.g. 8 for 08:00
  pxPerHour: number;    // e.g. 60
  enabled: boolean;     // false when selection mode active
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Round to the nearest 5-minute mark. */
export function snapTo5(min: number): number {
  return Math.round(min / 5) * 5;
}

/** Convert minutes-from-midnight to "HH:MM". */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useDrawToCreate({ calStartHour, pxPerHour, enabled }: UseDrawToCreateOptions) {
  const [draw, setDraw] = useState<DrawState | null>(null);

  // Ref keeps the anchor minute so we don't depend on stale state during moves
  const anchorRef = useRef<{ date: string; min: number } | null>(null);

  /** Convert a pixel offset from the top of the day column to minutes (snapped). */
  const pxToMin = useCallback(
    (px: number): number => {
      const raw = calStartHour * 60 + (px / pxPerHour) * 60;
      return snapTo5(raw);
    },
    [calStartHour, pxPerHour],
  );

  /* ---- pointer down ---- */
  const onPointerDown = useCallback(
    (date: string, e: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;

      // Don't start draw when clicking on an existing event card
      if ((e.target as HTMLElement).closest('[data-event-card]')) return;

      // Capture pointer for reliable tracking even if cursor leaves element
      e.currentTarget.setPointerCapture(e.pointerId);

      const rect = e.currentTarget.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const min = pxToMin(offsetY);

      anchorRef.current = { date, min };
      setDraw({ date, startMin: min, endMin: min, active: true });
    },
    [enabled, pxToMin],
  );

  /* ---- pointer move ---- */
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!anchorRef.current) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const current = pxToMin(offsetY);
      const anchor = anchorRef.current.min;

      setDraw({
        date: anchorRef.current.date,
        startMin: Math.min(anchor, current),
        endMin: Math.max(anchor, current),
        active: true,
      });
    },
    [pxToMin],
  );

  /* ---- pointer up ---- */
  const onPointerUp = useCallback((): DrawResult | null => {
    const state = anchorRef.current;
    if (!state) return null;

    // Read the latest draw state synchronously via a small trick:
    // we need startMin/endMin, so we'll compute from the last setDraw call.
    let result: DrawResult | null = null;

    setDraw((prev) => {
      if (prev && prev.endMin - prev.startMin >= 15) {
        result = {
          date: prev.date,
          startTime: minutesToTime(prev.startMin),
          durationMinutes: prev.endMin - prev.startMin,
        };
      }
      return null; // always clear
    });

    anchorRef.current = null;
    return result;
  }, []);

  /* ---- cancel ---- */
  const cancel = useCallback(() => {
    anchorRef.current = null;
    setDraw(null);
  }, []);

  return { draw, onPointerDown, onPointerMove, onPointerUp, cancel } as const;
}
