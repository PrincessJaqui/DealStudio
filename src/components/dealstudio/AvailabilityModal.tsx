/**
 * AvailabilityModal — Calendly-style weekly availability editor.
 * Set recurring hours per weekday, a meeting length, and optional one-off
 * date overrides. Returns a DealSchedule to persist into dealstudios.availability.
 */

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { DealSchedule, TimeRange, DAY_NAMES, emptySchedule } from '../../lib/dealStudio';

interface Props {
  value: DealSchedule;
  onClose: () => void;
  onSave: (schedule: DealSchedule) => void;
}

const LENGTHS = [15, 30, 45, 60];

export function AvailabilityModal({ value, onClose, onSave }: Props) {
  const [schedule, setSchedule] = useState<DealSchedule>(() => ({
    ...emptySchedule(),
    ...value,
    weekly: { ...emptySchedule().weekly, ...(value?.weekly || {}) },
    overrides: value?.overrides || [],
  }));

  const setDay = (day: number, ranges: TimeRange[]) => setSchedule(s => ({ ...s, weekly: { ...s.weekly, [day]: ranges } }));
  const toggleDay = (day: number, on: boolean) => setDay(day, on ? [{ start: '09:00', end: '17:00' }] : []);
  const addRange = (day: number) => setDay(day, [...(schedule.weekly[day] || []), { start: '09:00', end: '17:00' }]);
  const setRange = (day: number, i: number, patch: Partial<TimeRange>) =>
    setDay(day, schedule.weekly[day].map((r, j) => j === i ? { ...r, ...patch } : r));
  const removeRange = (day: number, i: number) => setDay(day, schedule.weekly[day].filter((_, j) => j !== i));

  const addOverride = () => setSchedule(s => ({ ...s, overrides: [...s.overrides, { date: '', ranges: [{ start: '09:00', end: '17:00' }] }] }));
  const setOverride = (i: number, patch: Partial<{ date: string; ranges: TimeRange[] }>) =>
    setSchedule(s => ({ ...s, overrides: s.overrides.map((o, j) => j === i ? { ...o, ...patch } : o) }));
  const removeOverride = (i: number) => setSchedule(s => ({ ...s, overrides: s.overrides.filter((_, j) => j !== i) }));

  const timeInput = 'h-9 rounded-lg bg-white border border-[#edf0f3] px-2 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-[#edf0f3] overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#edf0f3]">
          <div>
            <h3 className="text-lg font-bold text-[#191f1d]">Availability</h3>
            <p className="text-xs text-[#7f8c85]">Set the weekly hours investors can book meetings.</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:bg-[#f5f7f9]"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Meeting length */}
          <div className="flex items-center justify-between rounded-xl bg-[#f5f6f8] px-3 py-2.5">
            <span className="text-sm font-medium text-[#191f1d]">Meeting length</span>
            <div className="flex gap-1">
              {LENGTHS.map(l => (
                <button key={l} onClick={() => setSchedule(s => ({ ...s, meetingLength: l }))}
                  className={`h-8 px-3 rounded-lg text-sm font-medium ${schedule.meetingLength === l ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white' : 'text-[#7f8c85] hover:bg-white'}`}>{l}m</button>
              ))}
            </div>
          </div>

          {/* Weekly hours */}
          <div className="space-y-2">
            {DAY_NAMES.map((name, day) => {
              const ranges = schedule.weekly[day] || [];
              const on = ranges.length > 0;
              return (
                <div key={day} className="rounded-xl bg-[#f5f6f8] px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={on} onCheckedChange={(v) => toggleDay(day, v)} />
                      <span className={`text-sm font-medium ${on ? 'text-[#191f1d]' : 'text-[#99a1af]'}`}>{name}</span>
                    </div>
                    {on && <button onClick={() => addRange(day)} className="text-xs text-[var(--ds-brand)] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add hours</button>}
                  </div>
                  {on && (
                    <div className="mt-2 space-y-1.5">
                      {ranges.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="time" value={r.start} onChange={e => setRange(day, i, { start: e.target.value })} className={timeInput} />
                          <span className="text-[#7f8c85] text-sm">to</span>
                          <input type="time" value={r.end} onChange={e => setRange(day, i, { end: e.target.value })} className={timeInput} />
                          {ranges.length > 1 && <button onClick={() => removeRange(day, i)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:bg-white"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Date overrides */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#191f1d]">Specific date overrides</span>
              <button onClick={addOverride} className="text-xs text-[var(--ds-brand)] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add date</button>
            </div>
            {schedule.overrides.length === 0 ? (
              <p className="text-xs text-[#99a1af]">Optional. Add a date to override its weekly hours.</p>
            ) : (
              <div className="space-y-2">
                {schedule.overrides.map((o, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f5f6f8] px-3 py-2.5">
                    <input type="date" value={o.date} onChange={e => setOverride(i, { date: e.target.value })} className={`${timeInput} flex-1 min-w-[140px]`} />
                    <input type="time" value={o.ranges[0]?.start || ''} onChange={e => setOverride(i, { ranges: [{ start: e.target.value, end: o.ranges[0]?.end || '17:00' }] })} className={timeInput} />
                    <span className="text-[#7f8c85] text-sm">to</span>
                    <input type="time" value={o.ranges[0]?.end || ''} onChange={e => setOverride(i, { ranges: [{ start: o.ranges[0]?.start || '09:00', end: e.target.value }] })} className={timeInput} />
                    <button onClick={() => removeOverride(i)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:bg-white"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#edf0f3]">
          <Button onClick={onClose} className="h-10 rounded-xl bg-[#f5f7f9] text-[#191f1d] hover:bg-[#edf0f3]">Cancel</Button>
          <Button onClick={() => { onSave(schedule); onClose(); }} className="h-10 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)]">Save availability</Button>
        </div>
      </div>
    </div>
  );
}
