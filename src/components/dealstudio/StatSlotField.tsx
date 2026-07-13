/**
 * StatSlotField — one of the two configurable Deal Information tiles.
 *
 * Round and Raise Amount are fixed, because they are the two things every
 * investor looks for first. These two slots let the founder surface whatever
 * else matters for their raise.
 *
 * team_size reads its column directly. Headquarters is READ-ONLY here: it is
 * owned by the Headquarters field under Tags, so there is exactly one place to
 * set the company's location and the map can never disagree with the tile.
 *
 * team_size and headquarters read the columns that already exist rather than
 * duplicating them, so switching a slot away and back does not lose the value.
 */

import { STAT_KIND_LABELS, type StatKind, type StatSlot } from '../../lib/dealStudio';

const input =
  'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';

const KINDS: StatKind[] = ['total_raised', 'team_size', 'instrument', 'headquarters', 'other'];

const PLACEHOLDER: Record<StatKind, string> = {
  total_raised: '$250K',
  team_size: '4',
  instrument: 'SAFE',
  headquarters: 'Kansas City, MO',
  other: '18 months',
};

export function StatSlotField({
  slot,
  teamSize,
  headquarters,
  onSlot,
  onTeamSize,
}: {
  slot: StatSlot;
  teamSize: number;
  headquarters: string;
  onSlot: (next: StatSlot) => void;
  onTeamSize: (n: number) => void;
}) {
  const kind = slot.kind;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <select
          value={kind}
          onChange={(e) => onSlot({ ...slot, kind: e.target.value as StatKind })}
          className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)] bg-transparent outline-none cursor-pointer"
        >
          {KINDS.map(k => (
            <option key={k} value={k}>{STAT_KIND_LABELS[k]}</option>
          ))}
        </select>
      </div>

      {/* 'other' needs its own label, since nothing else names it. */}
      {kind === 'other' && (
        <input
          value={slot.label ?? ''}
          onChange={(e) => onSlot({ ...slot, label: e.target.value })}
          className={`${input} mb-2`}
          placeholder="Label (e.g. Runway)"
        />
      )}

      {kind === 'team_size' ? (
        <input
          type="number"
          value={teamSize || ''}
          onChange={(e) => onTeamSize(parseInt(e.target.value) || 0)}
          className={input}
          placeholder={PLACEHOLDER.team_size}
        />
      ) : kind === 'headquarters' ? (
        <div>
          <input
            value={headquarters}
            readOnly
            className={`${input} bg-[#f5f6f8] text-[#7f8c85] cursor-not-allowed`}
            placeholder={PLACEHOLDER.headquarters}
          />
          <p className="text-[11px] text-[#9ca3af] mt-1">
            Set in Headquarters, below Tags.
          </p>
        </div>
      ) : (
        <input
          value={slot.value ?? ''}
          onChange={(e) => onSlot({ ...slot, value: e.target.value })}
          className={input}
          placeholder={PLACEHOLDER[kind]}
        />
      )}
    </div>
  );
}

/** Resolves what a slot should display in the investor room. */
export function statSlotValue(
  slot: StatSlot,
  room: { team_size?: number | null; headquarters?: string | null },
): { label: string; value: string } {
  const label =
    slot.kind === 'other'
      ? (slot.label?.trim() || 'Other')
      : STAT_KIND_LABELS[slot.kind];

  const value =
    slot.kind === 'team_size'
      ? (room.team_size ? String(room.team_size) : '')
      : slot.kind === 'headquarters'
        ? (room.headquarters ?? '')
        : (slot.value ?? '');

  return { label, value: value || '\u2014' };
}
