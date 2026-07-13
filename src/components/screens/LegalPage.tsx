/**
 * LegalPage — shared shell for Terms and Privacy.
 *
 * One layout for both, so they cannot drift apart in style, and so a third
 * document later costs nothing to add.
 */

import { useNavigate } from 'react-router-dom';
import { PublicHeader } from '../dealstudio/PublicHeader';

export function LegalPage({
  title,
  version,
  effective,
  children,
}: {
  title: string;
  version: string;
  effective: string;
  children: React.ReactNode;
}) {
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-[#0c1022]">
      <PublicHeader />

      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-8 sm:p-10">
          <h1 className="text-2xl font-bold text-[#191f1d]">{title}</h1>
          <p className="text-sm text-[#7f8c85] mt-1">
            {version} &middot; Effective {effective}
          </p>

          <div className="ds-legal mt-8">{children}</div>
        </div>

        <p className="text-xs text-[#9ca3af] text-center mt-6">
          Questions about this document? hello@dealstudio.io
        </p>
      </div>
    </div>
  );
}

/** Numbered section. Keeps every clause referenceable, which matters in a dispute. */
export function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-base font-bold text-[#191f1d] mb-2">
        {n}. {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-[#4b5563]">{children}</div>
    </section>
  );
}
