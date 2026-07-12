/**
 * EventsCalendar.tsx
 *
 * Month-view calendar widget that highlights dates with events.
 * Used in both desktop (sticky right rail) and mobile (top of view) layouts.
 *
 * Visual states:
 *   - Default day: gray text on white
 *   - Has events: tiny green dot below the day number
 *   - Today: light-green rounded outline (subtle)
 *   - Selected: filled green circle, white text
 *   - Today AND selected: filled green circle (selected wins)
 */

import { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import type { Event } from '../lib/mockData';

interface EventsCalendarProps {
  events: Event[];
  selectedDate: string | null;     // YYYY-MM-DD, or null for none
  onSelectDate: (date: string | null) => void;
  currentMonth: Date;              // Any date inside the displayed month
  onChangeMonth: (newMonth: Date) => void;
  /** YYYY-MM-DD of the day to light up while its event card is hovered. */
  hoveredDate?: string | null;
  /** Tailwind height class for each day-grid row. Defaults to h-11.
   *  Pass a taller value (e.g. h-[55px]) to make the calendar taller. */
  rowHeightClass?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function EventsCalendar({
  events,
  selectedDate,
  onSelectDate,
  currentMonth,
  onChangeMonth,
  hoveredDate = null,
  rowHeightClass = 'h-11',
}: EventsCalendarProps) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Quick month/year picker — lets users jump to any month/year directly
  // instead of stepping through with the chevrons. 'none' | 'month' | 'year'.
  const [picker, setPicker] = useState<'none' | 'month' | 'year'>('none');
  const yearOptions = useMemo(() => {
    const base = new Date().getFullYear();
    const start = Math.min(base, year) - 3;
    const end = Math.max(base, year) + 6;
    const arr: number[] = [];
    for (let y = start; y <= end; y++) arr.push(y);
    return arr;
  }, [year]);

  // Build a map of YYYY-MM-DD → events count for fast lookup
  const eventsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    events.forEach((e: any) => {
      // Primary date
      const k = toDateKey(e.date);
      if (k) map[k] = (map[k] || 0) + 1;
      // Multi-date events
      if (Array.isArray(e.dates)) {
        e.dates.forEach((d: any) => {
          const k2 = toDateKey(d.date);
          if (k2) map[k2] = (map[k2] || 0) + 1;
        });
      }
    });
    return map;
  }, [events]);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const today = new Date();
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const goPrev = () => onChangeMonth(new Date(year, month - 1, 1));
  const goNext = () => onChangeMonth(new Date(year, month + 1, 1));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-[var(--ds-brand)] shrink-0" />
          {/* Month + year are individually clickable to open a quick picker,
              so users can jump straight to a month/year instead of clicking
              the chevrons repeatedly. */}
          <h3 className="text-lg font-bold text-[#191f1d] tracking-tight flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPicker(p => (p === 'month' ? 'none' : 'month'))}
              aria-label="Choose month"
              className="inline-flex items-center gap-0.5 rounded-md px-1 -mx-1 hover:bg-[var(--ds-tint)] hover:text-[var(--ds-brand)] transition-colors"
            >
              {MONTH_NAMES[month]}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${picker === 'month' ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setPicker(p => (p === 'year' ? 'none' : 'year'))}
              aria-label="Choose year"
              className="inline-flex items-center gap-0.5 rounded-md px-1 hover:bg-[var(--ds-tint)] hover:text-[var(--ds-brand)] transition-colors"
            >
              {year}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${picker === 'year' ? 'rotate-180' : ''}`} />
            </button>
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            aria-label="Previous month"
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-[#f8fafb] text-[#4a5565]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goNext}
            aria-label="Next month"
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-[#f8fafb] text-[#4a5565]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Quick-picker dropdown */}
        {picker !== 'none' && (
          <>
            {/* Click-away backdrop */}
            <button
              type="button"
              aria-label="Close picker"
              onClick={() => setPicker('none')}
              className="fixed inset-0 z-20 cursor-default"
            />
            <div className="absolute left-0 top-full mt-2 z-30 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.18)]">
              {picker === 'month' ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {MONTH_ABBR.map((m, i) => {
                    const active = i === month;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { onChangeMonth(new Date(year, i, 1)); setPicker('none'); }}
                        className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                          active
                            ? 'bg-[var(--ds-brand)] text-white'
                            : 'text-[#4a5565] hover:bg-[var(--ds-tint)] hover:text-[var(--ds-brand)]'
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto">
                  {yearOptions.map(y => {
                    const active = y === year;
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => { onChangeMonth(new Date(y, month, 1)); setPicker('none'); }}
                        className={`py-2 rounded-lg text-sm font-medium transition-colors tabular-nums ${
                          active
                            ? 'bg-[var(--ds-brand)] text-white'
                            : 'text-[#4a5565] hover:bg-[var(--ds-tint)] hover:text-[var(--ds-brand)]'
                        }`}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-xs font-medium text-[#99a1af] py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={idx} className={rowHeightClass} />;
          const cellKey = formatDateKey(year, month, day);
          const isToday = cellKey === todayKey;
          const isSelected = cellKey === selectedDate;
          const isHovered = !!hoveredDate && cellKey === hoveredDate;
          const eventCount = eventsByDate[cellKey] || 0;
          const hasEvents = eventCount > 0;

          return (
            <div key={idx} className={`flex flex-col items-center justify-center ${rowHeightClass} relative`}>
              <button
                onClick={() => onSelectDate(isSelected ? null : cellKey)}
                className={`flex items-center justify-center w-9 h-9 rounded-full text-sm transition-all ${
                  isSelected
                    ? 'bg-[var(--ds-brand)] text-white font-semibold shadow-sm'
                    : isHovered
                    ? 'bg-[var(--ds-brand)]/20 text-[#191f1d] font-semibold ring-1 ring-[var(--ds-brand)]/50 scale-110'
                    : isToday
                    ? 'bg-[var(--ds-tint)] text-[#191f1d] font-semibold ring-1 ring-[var(--ds-brand)]/40'
                    : 'text-[#4a5565] hover:bg-[#f8fafb]'
                }`}
              >
                {day}
              </button>
              {/* Event-count dots: up to 3 stacked horizontally so a day
                  with multiple events reads as a denser cluster than a
                  day with one. Capped at 3 to keep the row clean — 4+
                  events still shows 3 dots. */}
              {hasEvents && !isSelected && (
                <div className="absolute bottom-0.5 flex gap-0.5">
                  {Array.from({ length: Math.min(eventCount, 3) }).map((_, i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]" />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMonthGrid(year: number, month: number): Array<number | null> {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay(); // 0 = Sun

  const cells: Array<number | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to a full week to keep grid alignment
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Convert any date string we might find on an event into a YYYY-MM-DD key. */
export function toDateKey(input: string | undefined | null): string | null {
  if (!input) return null;
  // If already YYYY-MM-DD, take first 10 chars
  if (/^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  return formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Format selected date as "MONDAY, MAY 25" for the desktop preview header. */
export function formatSelectedHeader(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const monthName = date.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  return `${weekday}, ${monthName} ${d}`;
}
