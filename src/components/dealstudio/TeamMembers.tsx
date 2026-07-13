/**
 * TeamMembers — add and remove people on the company account.
 *
 * Owners can manage the team; admins can only look. The server enforces that,
 * so this component simply hides controls the caller cannot use rather than
 * pretending they work.
 */

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Shield, Clock } from 'lucide-react';
import {
  fetchOrgMembers, addOrgMember, removeOrgMember, setOrgMemberRole,
  type OrgMember,
} from '../../lib/org';
import { fetchMyOrg } from '../../lib/org';
import { orgSeatStatus, isSeatError, type SeatStatus } from '../../lib/billing';

const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5';
const field =
  'w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';

export function TeamMembers() {
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'admin'>('admin');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [seats, setSeats] = useState<SeatStatus | null>(null);

  const load = async () => setMembers(await fetchOrgMembers());
  const refreshSeats = async () => {
    const org = await fetchMyOrg();
    if (org) setSeats(await orgSeatStatus(org.id));
  };

  useEffect(() => { void load(); void refreshSeats(); }, []);

  const you = members?.find(m => m.is_you);
  const canManage = you?.role === 'owner';

  const add = async () => {
    setBusy('add'); setError(''); setNote('');
    try {
      const r = await addOrgMember(email.trim(), role);
      setEmail('');
      setNote(
        r.added === false ? (r.reason ?? 'Already on the team')
        : r.pending ? 'Invite saved. They will join this company when they sign up.'
        : 'Added to the team.'
      );
      await load();
    } catch (e: any) {
      // The seat limit is enforced in the database, so this is the authoritative
      // answer, not a hint. Say what it costs rather than just refusing.
      if (isSeatError(e)) {
        setError(
          seats
            ? `All ${seats.allowed} of your seats are in use. Add a paid seat in Billing to invite another team member.`
            : 'You are out of team seats. Add a paid seat in Billing to invite another team member.'
        );
      } else {
        setError(e?.message || 'Could not add that person');
      }
    } finally {
      setBusy('');
      void refreshSeats();
    }
  };

  const remove = async (m: OrgMember) => {
    setBusy(m.ref); setError(''); setNote('');
    try {
      await removeOrgMember(m);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not remove');
    } finally {
      setBusy('');
    }
  };

  const changeRole = async (m: OrgMember, next: 'owner' | 'admin') => {
    setBusy(m.ref); setError(''); setNote('');
    try {
      await setOrgMemberRole(m.ref, next);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not change role');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className={card}>
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-[#191f1d]">Team</h2>
        {seats && (
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              seats.can_add
                ? 'bg-[var(--ds-accent-tint)] text-[var(--ds-accent-ink)]'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            {seats.used} of {seats.allowed} seats
          </span>
        )}
      </div>
      {seats && !seats.can_add && (
        <p className="text-xs text-[#7f8c85] mt-1">
          Every seat is in use. Adding another team member requires a paid seat.
        </p>
      )}
      <p className="text-sm text-[#7f8c85] mt-0.5 mb-4">
        {canManage
          ? 'People who can sign in and manage your deals.'
          : 'People on this account. Only an owner can make changes.'}
      </p>

      {canManage && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && email.trim()) void add(); }}
            placeholder="colleague@company.com"
            type="email"
            className={`${field} flex-1`}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'owner' | 'admin')}
            className={`${field} sm:w-32`}
          >
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <button
            onClick={() => void add()}
            disabled={busy === 'add' || !email.trim()}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60"
          >
            {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {note && <p className="text-sm text-[var(--ds-accent-ink)] mb-3">{note}</p>}

      {members === null ? (
        <div className="flex items-center gap-2 text-sm text-[#7f8c85] py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading
        </div>
      ) : (
        <div className="divide-y divide-[#f2f4f6]">
          {members.map((m) => (
            <div key={m.ref} className="flex items-center gap-3 py-3">
              <span className="w-9 h-9 shrink-0 rounded-xl bg-[var(--ds-tint)] text-[var(--ds-brand)] text-xs font-bold flex items-center justify-center">
                {m.email.slice(0, 2).toUpperCase()}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#191f1d] truncate">
                  {m.email}
                  {m.is_you && <span className="text-[#7f8c85] font-normal"> (you)</span>}
                </p>
                <p className="text-xs text-[#7f8c85] flex items-center gap-1">
                  {m.pending
                    ? <><Clock className="w-3 h-3" /> Invited, waiting for them to sign up</>
                    : m.role === 'owner'
                      ? <><Shield className="w-3 h-3" /> Owner</>
                      : 'Admin'}
                </p>
              </div>

              {canManage && !m.pending && !m.is_you && (
                <select
                  value={m.role}
                  disabled={busy === m.ref}
                  onChange={(e) => void changeRole(m, e.target.value as 'owner' | 'admin')}
                  className="h-9 rounded-xl bg-[#f5f6f8] px-2 text-xs font-medium text-[#191f1d] outline-none"
                >
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
              )}

              {canManage && !m.is_you && (
                <button
                  onClick={() => void remove(m)}
                  disabled={busy === m.ref}
                  aria-label="Remove"
                  className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-[#7f8c85] hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  {busy === m.ref
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
