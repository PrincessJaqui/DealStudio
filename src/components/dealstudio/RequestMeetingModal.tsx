/**
 * RequestMeetingModal — investors request a meeting either by picking an
 * available slot from the founder's schedule, or by proposing their own time.
 */

import { useMemo, useState } from 'react';
import { X, Loader2, CalendarClock, Clock } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Button } from '../ui/button';
import { DealSchedule, scheduleDates, scheduleSlots, requestMeeting } from '../../lib/dealStudio';

interface Props {
  slug: string;
  schedule: DealSchedule;
  defaultEmail?: string | null;
  /** Preselected from the calendar, so an investor who already picked a time is
   *  not made to pick it again. */
  defaultDate?: string | null;
  defaultSlot?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
}

const fmtDate = (key: string) => new Date(key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export function RequestMeetingModal({ slug, schedule, defaultEmail, defaultDate, defaultSlot, onClose, onSubmitted }: Props) {
  const [mode, setMode] = useState<'available' | 'custom'>('available');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(defaultEmail || '');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(defaultDate || '');
  const [slot, setSlot] = useState(defaultSlot || '');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [busy, setBusy] = useState(false);

  const dates = useMemo(() => scheduleDates(schedule, new Date(), 60), [schedule]);
  const slots = useMemo(() => (date ? scheduleSlots(schedule, date) : []), [schedule, date]);
  const hasAvailability = dates.length > 0;

  const input = 'w-full h-11 rounded-xl bg-[#f5f6f8] px-3 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40';

  const submit = async () => {
    if (!email.trim()) { toast.error('Enter your email'); return; }
    const d = mode === 'available' ? date : customDate;
    const t = mode === 'available' ? slot : customTime;
    if (!d || !t) { toast.error(mode === 'available' ? 'Pick a date and time' : 'Choose a date and time'); return; }
    setBusy(true);
    const r = await requestMeeting(slug, email.trim().toLowerCase(), name.trim(), d, t, '', note.trim());
    setBusy(false);
    if (r.ok) { toast.success('Meeting request sent'); onSubmitted?.(); onClose(); }
    else toast.error(r.error ? `Couldn't send: ${r.error}` : 'Could not send the request. Try again.');
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-[#edf0f3] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#edf0f3]">
          <h3 className="text-lg font-bold text-[#191f1d]">Request a meeting</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:bg-[#f5f7f9]"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Mode toggle */}
          {hasAvailability && (
            <div className="flex gap-1 bg-[#f5f7f9] rounded-xl p-1">
              <button onClick={() => setMode('available')} className={`flex-1 h-9 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${mode === 'available' ? 'bg-white shadow-sm text-[#191f1d]' : 'text-[#7f8c85]'}`}><CalendarClock className="w-4 h-4" /> Available times</button>
              <button onClick={() => setMode('custom')} className={`flex-1 h-9 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${mode === 'custom' ? 'bg-white shadow-sm text-[#191f1d]' : 'text-[#7f8c85]'}`}><Clock className="w-4 h-4" /> Request a time</button>
            </div>
          )}

          {mode === 'available' && hasAvailability ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#7f8c85] mb-1">Date</label>
                <select value={date} onChange={e => { setDate(e.target.value); setSlot(''); }} className={input}>
                  <option value="">Select a date</option>
                  {dates.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
                </select>
              </div>
              {date && (
                <div>
                  <label className="block text-xs font-semibold text-[#7f8c85] mb-1">Time</label>
                  {slots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-1.5">
                      {slots.map(s => (
                        <button key={s} onClick={() => setSlot(s)} className={`h-9 rounded-lg text-sm font-medium border ${slot === s ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white border-transparent' : 'border-[#edf0f3] text-[#191f1d] hover:border-[var(--ds-brand)]'}`}>{s}</button>
                      ))}
                    </div>
                  ) : <p className="text-xs text-[#99a1af]">No times on this date.</p>}
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#7f8c85] mb-1">Preferred date</label>
                <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} className={input} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7f8c85] mb-1">Preferred time</label>
                <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)} className={input} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-[#7f8c85] mb-1">Name</label><input value={name} onChange={e => setName(e.target.value)} className={input} placeholder="Your name" /></div>
            <div><label className="block text-xs font-semibold text-[#7f8c85] mb-1">Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" className={input} placeholder="you@firm.com" /></div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#7f8c85] mb-1">Note (optional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full rounded-xl bg-[#f5f6f8] px-3 py-2 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40 resize-none" placeholder="Anything you'd like to cover" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#edf0f3]">
          <Button onClick={onClose} className="h-10 rounded-xl bg-[#f5f7f9] text-[#191f1d] hover:bg-[#edf0f3]">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="h-10 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)] disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Send request
          </Button>
        </div>
      </div>
    </div>
  );
}
