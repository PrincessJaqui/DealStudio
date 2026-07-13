/**
 * SiteFooter — one footer, used everywhere.
 *
 * The landing page had TWO footer blocks: the custom-landing branch rendered the
 * Terms/Privacy/SOC line twice (a copy-paste that was never cleaned up), while
 * the default branch showed only a copyright. Two copies of the same markup in
 * one file is how they drift apart, so there is now one component and both
 * branches call it.
 */

export function SiteFooter() {
  return (
    <footer className="border-t border-[#e6e8ee] dark:border-[#242c47] py-9">
      <div className="mx-auto max-w-6xl px-6 text-center text-[14px] text-[#5b6478] dark:text-[#9aa4be]">
        <p>&copy; {new Date().getFullYear()} DealStudio&trade;</p>

        <p className="mt-2">
          <a href="/terms" className="hover:text-[var(--ds-brand)]">Terms</a>
          <span className="mx-2 text-[#c7cdd4]">|</span>
          <a href="/privacy" className="hover:text-[var(--ds-brand)]">Privacy</a>
          <span className="mx-2 text-[#c7cdd4]">|</span>
          {/* mailto, so it opens whatever mail client they actually use rather
              than a form that quietly drops messages. */}
          <a href="mailto:hello@dealstudio.io" className="hover:text-[var(--ds-brand)]">Contact</a>
        </p>

        <p className="mt-2 text-[13px] text-[#9aa4be]">
          Hosted on SOC 2 Type 2 compliant infrastructure.
        </p>
        <p className="text-[13px] text-[#9aa4be]">
          Encrypted in transit and at rest.
        </p>
      </div>
    </footer>
  );
}
