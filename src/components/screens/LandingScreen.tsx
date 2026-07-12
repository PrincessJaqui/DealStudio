import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, BarChart3, Eye, Moon, Sun, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useInViewOnce } from '../../lib/useInViewOnce';

const GRAD = 'bg-gradient-to-br from-[#242473] via-[#2C42A5] to-[#503DBB]';

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('dealstudio_theme');
    const isDark = saved === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);
  const toggle = () => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem('dealstudio_theme', next ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };
  return { dark, toggle };
}

export function LandingScreen() {
  const nav = useNavigate();
  const { dark, toggle } = useTheme();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setEmail(session?.user?.email ?? null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };
  const initials = (email || '?').slice(0, 2).toUpperCase();
  const { ref: featuresRef, inView } = useInViewOnce<HTMLElement>();

  return (
    <div className="min-h-screen bg-[#f5f6f8] dark:bg-[#0b0e1a] text-[#0c1022] dark:text-[#eef1fa]">
      <header className="sticky top-0 z-30 border-b border-[#e6e8ee] dark:border-[#242c47] bg-[#f5f6f8]/85 dark:bg-[#0b0e1a]/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 h-[68px] flex items-center gap-7">
          <button onClick={() => nav('/')} className="flex items-center font-bold text-[21px] tracking-tight">
            DealStudio
          </button>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={toggle} aria-label="Toggle theme" className="w-9 h-9 rounded-xl border border-[#e6e8ee] dark:border-[#242c47] flex items-center justify-center text-[#5b6478] dark:text-[#9aa4be] hover:text-[#0c1022] dark:hover:text-white">
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {email ? (
              <>
                <button onClick={() => nav('/admin')} className="rounded-xl border border-[#e6e8ee] dark:border-[#242c47] px-4 py-2.5 text-[15px] font-semibold hover:bg-white dark:hover:bg-[#141a2e]">Dashboard</button>
                <span className={`w-[34px] h-[34px] rounded-full ${GRAD} text-white text-[13px] font-semibold flex items-center justify-center`}>{initials}</span>
                <button onClick={signOut} className="px-2 py-2.5 text-[15px] font-semibold text-[#5b6478] dark:text-[#9aa4be] hover:text-[#0c1022] dark:hover:text-white">Log out</button>
              </>
            ) : (
              <>
                <button onClick={() => nav('/admin')} className="px-2 py-2.5 text-[15px] font-semibold">Log in</button>
                <button onClick={() => nav('/admin')} className={`rounded-xl ${GRAD} text-white px-[18px] py-2.5 text-[15px] font-semibold shadow-[0_10px_24px_-10px_rgba(80,61,187,0.6)] hover:brightness-110 transition`}>Get started</button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 grid md:grid-cols-2 gap-12 items-center pt-[74px] pb-20">
        <div>
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#0C8577] dark:text-[#64D7CD] bg-[#eef0f4] dark:bg-[#1a2137] border border-[#e6e8ee] dark:border-[#242c47] px-3 py-1.5 rounded-full">Investor deal rooms</span>
          <h1 className="mt-5 text-[clamp(38px,5vw,58px)] font-bold leading-[1.08] tracking-tight">
            Your Studio, <span className="bg-gradient-to-br from-[#242473] via-[#2C42A5] to-[#503DBB] bg-clip-text text-transparent">Your Raise.</span>
          </h1>
          <p className="mt-5 text-[18px] text-[#5b6478] dark:text-[#9aa4be] max-w-[38ch]">Build your deal, upload your deck, and manage investor access from a single command center.</p>
          <div className="mt-7 flex flex-wrap gap-3.5">
            <button onClick={() => nav('/admin')} className={`rounded-xl ${GRAD} text-white px-[18px] py-3 font-semibold shadow-[0_10px_24px_-10px_rgba(80,61,187,0.6)] hover:brightness-110 hover:-translate-y-0.5 transition inline-flex items-center gap-2`}>Start your deal room <ArrowRight className="w-4 h-4" /></button>
            <button onClick={() => nav('/dealstudio')} className="rounded-xl border border-[#e6e8ee] dark:border-[#242c47] bg-white dark:bg-[#141a2e] px-[18px] py-3 font-semibold hover:-translate-y-0.5 transition">See a live demo</button>
          </div>
        </div>

        <div className="rounded-[22px] bg-white dark:bg-[#141a2e] border border-[#e6e8ee] dark:border-[#242c47] shadow-[0_18px_50px_-20px_rgba(23,20,60,0.18)] p-4 hover:-translate-y-1 transition duration-300">
          <div className="flex items-center gap-2 px-1 pb-3">
            <span className="w-2 h-2 rounded-full bg-[#e6e8ee] dark:bg-[#242c47]" />
            <span className="w-2 h-2 rounded-full bg-[#e6e8ee] dark:bg-[#242c47]" />
            <span className="w-2 h-2 rounded-full bg-[#e6e8ee] dark:bg-[#242c47]" />
            <span className="ml-2 flex-1 flex items-center gap-2 bg-[#eef0f4] dark:bg-[#1a2137] border border-[#e6e8ee] dark:border-[#242c47] rounded-lg px-3 py-1.5 text-[12.5px] text-[#5b6478] dark:text-[#9aa4be]">
              <Lock className="w-3 h-3 text-[#0C8577] dark:text-[#64D7CD]" />
              dealstudio.io/investors
              <span className="ml-auto inline-flex items-center gap-1.5 font-semibold text-[#0C8577] dark:text-[#64D7CD]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#64D7CD] animate-pulse" />live
              </span>
            </span>
          </div>
          <div className="rounded-2xl bg-[#f5f6f8] dark:bg-[#0f1424] border border-[#e6e8ee] dark:border-[#242c47] p-4">
            <div className="flex items-center gap-3">
              <span className={`w-10 h-10 rounded-xl ${GRAD} text-white font-bold flex items-center justify-center`}>N</span>
              <div>
                <div className="font-semibold">Northwind Robotics</div>
                <div className="text-[12.5px] text-[#5b6478] dark:text-[#9aa4be]">Seed / $750K on a SAFE</div>
              </div>
              <span className="ml-auto text-[11.5px] font-semibold text-[#503DBB] dark:text-[#9C8FDD] bg-[#F1EFFB] dark:bg-[#1a2137] px-2.5 py-1 rounded-full">Invite only</span>
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              {[['Valuation cap', '$8.0M'], ['Committed', '$430K']].map(([lab, val]) => (
                <div key={lab} className="rounded-xl bg-white dark:bg-[#141a2e] border border-[#e6e8ee] dark:border-[#242c47] px-3 py-2.5">
                  <div className="text-[10.5px] uppercase tracking-wider font-semibold text-[#0C8577] dark:text-[#64D7CD]">{lab}</div>
                  <div className="mt-0.5 font-bold text-[19px] tabular-nums">{val}</div>
                </div>
              ))}
            </div>
            <div className="mt-3.5 flex items-end gap-1.5 h-[52px]">
              {[34, 52, 44, 70, 61, 88, 100].map((h, i) => (
                <span key={i} className="flex-1 rounded-t-md bg-[#64D7CD]" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section ref={featuresRef} className={`mx-auto max-w-6xl px-6 py-20 ${inView ? 'ds-animate' : ''}`}>
        <div className="max-w-[620px] mx-auto text-center mb-12">
          <h2 className="text-[clamp(28px,3.4vw,38px)] font-bold tracking-tight">A deal room that sells for you.</h2>
          <p className="mt-3.5 text-[17px] text-[#5b6478] dark:text-[#9aa4be]">Everything an investor needs to say yes, presented the way you would present it in the room.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { Icon: Lock, tint: GRAD, iconColor: 'text-white', title: 'Gated access', body: 'Password, invite-only, or a private share link. Revoke anytime. You decide who sees what, per investor.' },
            { Icon: BarChart3, tint: 'bg-[#64D7CD]', iconColor: 'text-[#08423b]', title: 'Live business model', body: 'An interactive revenue model and market funnel investors can explore. Edit once, everyone sees the latest.' },
            { Icon: Eye, tint: 'bg-gradient-to-br from-[#242473] to-[#2C42A5]', iconColor: 'text-white', title: 'Investor analytics', body: 'See who opened the deck, what they read, and how long. Follow up on the ones leaning in.' },
          ].map(({ Icon, tint, iconColor, title, body }) => (
            <div key={title} className="ds-card rounded-2xl bg-white dark:bg-[#141a2e] border border-[#e6e8ee] dark:border-[#242c47] shadow-[0_8px_30px_-12px_rgba(23,20,60,0.10)] p-6">
              <div className={`w-11 h-11 rounded-xl ${tint} flex items-center justify-center mb-4`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <h3 className="text-[19px] font-semibold">{title}</h3>
              <p className="mt-2 text-[15px] text-[#5b6478] dark:text-[#9aa4be]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className={`relative overflow-hidden rounded-3xl ${GRAD} px-10 py-14 text-center text-white`}>
          <span className="absolute -right-10 -top-16 w-72 h-72 rounded-full bg-[#64D7CD] opacity-30 blur-3xl" />
          <h2 className="relative text-[clamp(28px,3.4vw,38px)] font-bold tracking-tight">Ready to open your deal room?</h2>
          <p className="relative mt-3 text-[17px] text-white/80">Publish a private, always-current investor page in minutes.</p>
          <button onClick={() => nav('/admin')} className="relative mt-6 rounded-xl bg-white text-[#503DBB] px-[18px] py-3 font-semibold hover:-translate-y-0.5 transition">Start your deal room</button>
        </div>
      </section>

      <footer className="border-t border-[#e6e8ee] dark:border-[#242c47] py-9">
        <div className="mx-auto max-w-6xl px-6 flex flex-wrap items-center gap-4 text-[14px] text-[#5b6478] dark:text-[#9aa4be]">
          <span className="flex items-center font-bold text-[18px] text-[#0c1022] dark:text-[#eef1fa]">
            DealStudio
          </span>
          <span>&copy; {new Date().getFullYear()} DealStudio</span>
        </div>
      </footer>
    </div>
  );
}
