/**
 * CustomLanding — renders the blocks a platform admin built in Master Admin.
 *
 * Returns null when there are no blocks, which is what lets LandingScreen fall
 * back to the built-in page. That fallback is deliberate: an empty table should
 * never produce a blank marketing site.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { LandingBlock } from '../../lib/siteContent';
import { HeroMockup } from '../dealstudio/HeroMockup';
import { featureIcon } from '../dealstudio/featureIcons';

const GRAD = 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]';

export function CustomLanding({ blocks }: { blocks: LandingBlock[] }) {
  const nav = useNavigate();

  const go = (href?: string) => {
    if (!href) return;
    if (/^https?:\/\//i.test(href)) window.location.href = href;
    else nav(href);
  };

  return (
    <>
      {blocks.map(b => {
        if (b.type === 'hero') {
          return (
            <section key={b.id} className="mx-auto max-w-6xl px-6 pt-16 pb-12">
              <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
                <div>
                  {b.eyebrow && (
                    <p className="text-[13px] font-bold uppercase tracking-wider text-[var(--ds-accent-ink)]">
                      {b.eyebrow}
                    </p>
                  )}
                  {b.title && (
                    <h1 className="mt-3 text-[clamp(32px,4.6vw,52px)] font-bold leading-[1.08] tracking-tight text-[#0c1022] dark:text-[#eef1fa]">
                      {b.title}
                    </h1>
                  )}
                  {b.body && (
                    <p className="mt-4 text-[17px] leading-relaxed text-[#5b6478] dark:text-[#9aa4be] whitespace-pre-line">
                      {b.body}
                    </p>
                  )}
                  {(b.ctaLabel || b.cta2Label) && (
                    <div className="mt-7 flex flex-wrap gap-3.5">
                      {b.ctaLabel && (
                        <button
                          onClick={() => go(b.ctaHref)}
                          className={`inline-flex items-center gap-2 rounded-xl ${GRAD} text-white px-[18px] py-3 font-semibold hover:brightness-110 hover:-translate-y-0.5 transition`}
                        >
                          {b.ctaLabel} <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                      {/* The demo button. The live page has always had one; the
                          block renderer did not, so publishing dropped it. */}
                      {b.cta2Label && (
                        <button
                          onClick={() => go(b.cta2Href)}
                          className="inline-flex items-center rounded-xl border border-[#e6e8ee] dark:border-[#242c47] bg-white dark:bg-[#141a2e] px-[18px] py-3 font-semibold hover:-translate-y-0.5 transition"
                        >
                          {b.cta2Label}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* An uploaded image wins. With none, show the product itself:
                    an empty half-hero was why the published landing looked
                    thinner than the built-in one. */}
                {b.image ? (
                  <div className="rounded-2xl overflow-hidden border border-[#e6e8ee] dark:border-[#242c47] shadow-[0_24px_60px_-24px_rgba(12,16,34,0.35)]">
                    <img src={b.image} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <HeroMockup />
                )}
              </div>
            </section>
          );
        }

        if (b.type === 'features') {
          return (
            <section key={b.id} className="mx-auto max-w-6xl px-6 py-16">
              {(b.title || b.body) && (
                <div className="max-w-[760px] mx-auto text-center mb-10">
                  {b.title && (
                    <h2 className="text-[clamp(26px,3.2vw,36px)] font-bold tracking-tight text-[#0c1022] dark:text-[#eef1fa]">
                      {b.title}
                    </h2>
                  )}
                  {b.body && (
                    <p className="mt-3 text-[17px] text-[#5b6478] dark:text-[#9aa4be]">{b.body}</p>
                  )}
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {(b.items ?? []).map((it, i) => {
                  const Icon = featureIcon(it.icon);
                  return (
                  <div
                    key={i}
                    className="ds-card rounded-2xl border border-[#e6e8ee] dark:border-[#242c47] bg-white dark:bg-[#141a2e] p-6"
                  >
                    {Icon && (
                      <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white">
                        <Icon className="h-5 w-5" />
                      </span>
                    )}
                    {it.title && (
                      <h3 className="font-bold text-[#0c1022] dark:text-[#eef1fa]">{it.title}</h3>
                    )}
                    {it.body && (
                      <p className="mt-2 text-[15px] leading-relaxed text-[#5b6478] dark:text-[#9aa4be]">
                        {it.body}
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>
            </section>
          );
        }

        if (b.type === 'stats') {
          return (
            <section key={b.id} className="mx-auto max-w-6xl px-6 py-12">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {(b.items ?? []).map((it, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-[#e6e8ee] dark:border-[#242c47] bg-white dark:bg-[#141a2e] p-6 text-center"
                  >
                    <p className="text-[28px] font-bold text-[#0c1022] dark:text-[#eef1fa]">{it.title}</p>
                    <p className="mt-1 text-sm text-[#5b6478] dark:text-[#9aa4be]">{it.body}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        }

        if (b.type === 'image') {
          return (
            <section key={b.id} className="mx-auto max-w-6xl px-6 py-10">
              {b.image && (
                <div className="rounded-2xl overflow-hidden border border-[#e6e8ee] dark:border-[#242c47]">
                  <img src={b.image} alt={b.title ?? ''} className="w-full object-cover" />
                </div>
              )}
            </section>
          );
        }

        if (b.type === 'cta') {
          return (
            <section key={b.id} className="mx-auto max-w-6xl px-6 py-16">
              <div
                className={`rounded-2xl p-10 text-center ${
                  b.dark
                    ? `${GRAD} text-white`
                    : 'border border-[#e6e8ee] dark:border-[#242c47] bg-white dark:bg-[#141a2e]'
                }`}
              >
                {b.title && (
                  <h2
                    className={`text-[clamp(26px,3.2vw,36px)] font-bold tracking-tight ${
                      b.dark ? 'text-white' : 'text-[#0c1022] dark:text-[#eef1fa]'
                    }`}
                  >
                    {b.title}
                  </h2>
                )}
                {b.body && (
                  <p className={`mt-3 text-[17px] ${b.dark ? 'text-white/80' : 'text-[#5b6478] dark:text-[#9aa4be]'}`}>
                    {b.body}
                  </p>
                )}
                {b.ctaLabel && (
                  <button
                    onClick={() => go(b.ctaHref)}
                    className={`mt-6 rounded-xl px-[18px] py-3 font-semibold transition hover:-translate-y-0.5 ${
                      b.dark ? 'bg-white text-[var(--ds-brand)]' : `${GRAD} text-white`
                    }`}
                  >
                    {b.ctaLabel}
                  </button>
                )}
              </div>
            </section>
          );
        }

        // text
        return (
          <section key={b.id} className="mx-auto max-w-3xl px-6 py-14">
            {b.title && (
              <h2 className="text-[clamp(24px,3vw,32px)] font-bold tracking-tight text-[#0c1022] dark:text-[#eef1fa]">
                {b.title}
              </h2>
            )}
            {b.body && (
              <p className="mt-3 text-[17px] leading-relaxed text-[#5b6478] dark:text-[#9aa4be] whitespace-pre-line">
                {b.body}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}
