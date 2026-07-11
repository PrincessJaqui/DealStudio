/**
 * PdfDeckViewer — renders a PDF one page at a time (slide-deck style).
 * Inline it fits the container WIDTH (sized by the page aspect ratio, no side
 * gaps). It can expand to a full-screen overlay (fit-to-screen). Navigation via
 * side arrow buttons, arrow keys, and a page indicator. The arrows pulse until
 * the viewer first navigates, signalling there's a deck to click through.
 *
 * pdf.js is loaded lazily. Optional onPageView(page, seconds) fires when the
 * viewer leaves a page (page change or unmount) for per-page dwell analytics.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Maximize2, X } from 'lucide-react';

interface Props {
  url: string;
  className?: string;
  onPageView?: (page: number, seconds: number) => void;
}

let pdfjsPromise: Promise<any> | null = null;
function getPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist');
      // @ts-ignore — Vite resolves ?url to the worker asset URL string.
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    })();
  }
  return pdfjsPromise;
}

export function PdfDeckViewer({ url, className = '', onPageView }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const pageStartRef = useRef<number>(Date.now());
  const pageRef = useRef<number>(1);
  const fsRef = useRef(false);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [aspect, setAspect] = useState('16 / 9');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [navigated, setNavigated] = useState(false);

  const flushPage = useCallback(() => {
    const seconds = (Date.now() - pageStartRef.current) / 1000;
    if (onPageView && seconds > 0.4) onPageView(pageRef.current, Math.round(seconds));
    pageStartRef.current = Date.now();
  }, [onPageView]);

  const renderPage = useCallback(async (p: number) => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!pdf || !canvas || !root) return;
    try {
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* noop */ } }
      const pageObj = await pdf.getPage(p);
      const unscaled = pageObj.getViewport({ scale: 1 });
      setAspect(`${unscaled.width} / ${unscaled.height}`);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const fs = fsRef.current;
      const scale = fs
        ? Math.min(root.clientWidth / unscaled.width, (root.clientHeight - 96) / unscaled.height) // fit to screen, leaving room for controls below
        : root.clientWidth / unscaled.width;                                                // fit to width
      const cssW = unscaled.width * scale;
      const cssH = unscaled.height * scale;
      const viewport = pageObj.getViewport({ scale: scale * dpr });
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = fs ? `${cssW}px` : '100%';
      canvas.style.height = fs ? `${cssH}px` : '100%';
      renderTaskRef.current = pageObj.render({ canvasContext: ctx, viewport });
      await renderTaskRef.current.promise;
    } catch {
      /* cancelled or failed */
    }
  }, []);

  // Load once.
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(false);
    (async () => {
      try {
        const pdfjs = await getPdfjs();
        // Fetch pages on demand via HTTP range requests instead of pulling the
        // whole file up front, so page 1 paints without downloading everything.
        const doc = await pdfjs.getDocument({ url, disableAutoFetch: true, disableStream: false, rangeChunkSize: 262144 }).promise;
        if (!alive) return;
        pdfRef.current = doc;
        setNumPages(doc.numPages);
        setPage(1); pageRef.current = 1; pageStartRef.current = Date.now();
        await renderPage(1);
        if (alive) setLoading(false);
      } catch {
        if (alive) { setError(true); setLoading(false); }
      }
    })();
    return () => {
      alive = false;
      flushPage();
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* noop */ } }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Re-render on resize.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => void renderPage(pageRef.current), 150); };
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
  }, [renderPage]);

  // Flush the current page's dwell when the tab is hidden or closed, so a viewer
  // who lingers on one page (without navigating) still records page-level time.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushPage(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushPage);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flushPage); };
  }, [flushPage]);

  // Re-render + lock scroll when entering/leaving full screen.
  useEffect(() => {
    fsRef.current = fullscreen;
    document.body.style.overflow = fullscreen ? 'hidden' : '';
    // wait a frame for layout to settle before measuring
    const id = requestAnimationFrame(() => void renderPage(pageRef.current));
    return () => { cancelAnimationFrame(id); document.body.style.overflow = ''; };
  }, [fullscreen, renderPage]);

  const go = useCallback((next: number) => {
    setNavigated(true);
    setPage(prev => {
      const target = Math.max(1, Math.min(numPages || 1, next));
      if (target !== prev) { flushPage(); pageRef.current = target; void renderPage(target); }
      return target;
    });
  }, [numPages, renderPage, flushPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(pageRef.current + 1);
      else if (e.key === 'ArrowLeft') go(pageRef.current - 1);
      else if (e.key === 'Escape' && fsRef.current) setFullscreen(false);
    };
    const el = rootRef.current;
    el?.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onKey);
    return () => { el?.removeEventListener('keydown', onKey); window.removeEventListener('keydown', onKey); };
  }, [go]);

  const pillBtn = 'w-10 h-10 rounded-full bg-white border border-[#edf0f3] shadow-[0_2px_10px_rgba(0,0,0,0.12)] flex items-center justify-center text-[#191f1d] hover:border-[#76b252] disabled:opacity-30 disabled:cursor-not-allowed transition-colors';
  const hint = !navigated && page < numPages;

  const styleTag = (
    <style>{`
      @keyframes deckArrowPulse {
        0%, 100% { transform: translateY(-50%) scale(1); box-shadow: 0 2px 10px rgba(0,0,0,0.15); }
        50% { transform: translateY(-50%) scale(1.16); box-shadow: 0 0 0 7px rgba(118,178,82,0.20), 0 2px 10px rgba(0,0,0,0.15); }
      }
      .deck-arrow-pulse { animation: deckArrowPulse 1.5s ease-in-out infinite; }
      @keyframes deckNextPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 2px 10px rgba(0,0,0,0.12); }
        50% { transform: scale(1.14); box-shadow: 0 0 0 7px rgba(118,178,82,0.20), 0 2px 10px rgba(0,0,0,0.12); }
      }
      .deck-next-pulse { animation: deckNextPulse 1.5s ease-in-out infinite; border-color: #76b252; }
      @keyframes deckStageHint {
        0%, 100% { box-shadow: inset 0 0 0 0 rgba(118,178,82,0); }
        50% { box-shadow: inset 0 0 0 3px rgba(118,178,82,0.28); }
      }
      .deck-stage-hint { animation: deckStageHint 1.8s ease-in-out infinite; }
    `}</style>
  );

  if (fullscreen) {
    return (
      <div ref={rootRef} tabIndex={0} className="fixed inset-0 z-[95] bg-black/95 flex flex-col items-center justify-center outline-none select-none">
        {styleTag}
        <button type="button" onClick={() => setFullscreen(false)} aria-label="Exit full screen" className="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-white/95 backdrop-blur border border-[#edf0f3] shadow-[0_2px_10px_rgba(0,0,0,0.15)] flex items-center justify-center text-[#191f1d] hover:bg-white"><X className="w-4 h-4" /></button>
        {loading && <span className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-7 h-7 text-[#76b252] animate-spin" /></span>}
        {error && <span className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Couldn’t load this document.</span>}
        <canvas ref={canvasRef} className={loading || error ? 'hidden' : 'block'} />
        {!loading && !error && numPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-4">
            <button type="button" aria-label="Previous page" onClick={() => go(page - 1)} disabled={page <= 1} className={pillBtn}><ChevronLeft className="w-5 h-5" /></button>
            <span className="text-sm font-semibold text-white tabular-nums min-w-[52px] text-center">{page} / {numPages}</span>
            <button type="button" aria-label="Next page" onClick={() => go(page + 1)} disabled={page >= numPages} className={pillBtn}><ChevronRight className="w-5 h-5" /></button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} tabIndex={0} className={`w-full outline-none select-none ${className}`}>
      {styleTag}
      {/* Stage — the slide itself; expand button stays here as an overlay */}
      <div className={`relative w-full bg-white ${hint ? 'deck-stage-hint' : ''}`} style={{ aspectRatio: aspect }}>
        {loading && <span className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-7 h-7 text-[#76b252] animate-spin" /></span>}
        {error && <span className="absolute inset-0 flex items-center justify-center text-sm text-[#99a1af]">Couldn’t load this document.</span>}
        <canvas ref={canvasRef} className={loading || error ? 'hidden' : 'block'} />
        {!loading && !error && (
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            aria-label="View full screen"
            className="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-white/95 backdrop-blur border border-[#edf0f3] shadow-[0_2px_10px_rgba(0,0,0,0.15)] flex items-center justify-center text-[#191f1d] hover:bg-white"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation + page count — below the deck so nothing covers the slide */}
      {!loading && !error && numPages > 1 && (
        <div className="flex items-center justify-center gap-4 px-4 py-3">
          <button type="button" aria-label="Previous page" onClick={() => go(page - 1)} disabled={page <= 1} className={pillBtn}><ChevronLeft className="w-5 h-5" /></button>
          <span className="text-xs font-semibold text-[#191f1d] tabular-nums min-w-[52px] text-center">{page} / {numPages}</span>
          <button type="button" aria-label="Next page" onClick={() => go(page + 1)} disabled={page >= numPages} className={`${pillBtn}${hint ? ' deck-next-pulse' : ''}`}><ChevronRight className="w-5 h-5" /></button>
        </div>
      )}
    </div>
  );
}
