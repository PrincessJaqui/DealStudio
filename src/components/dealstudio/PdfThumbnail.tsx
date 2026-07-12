/**
 * PdfThumbnail — renders the first page of a PDF as a real preview image,
 * fit to the container width and aligned to the top. Falls back to a clean
 * white faux-page while loading or if rendering fails. pdf.js is lazy-loaded.
 */

import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';

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

export function PdfThumbnail({ url, label = 'PDF', page = 1 }: { url: string; label?: string; page?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false); setFailed(false);
    (async () => {
      try {
        const pdfjs = await getPdfjs();
        const doc = await pdfjs.getDocument({ url, disableAutoFetch: true, disableStream: false, rangeChunkSize: 262144 }).promise;
        if (!alive) return;
        const pg = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return;
        const unscaled = pg.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
        const cssWidth = wrap.clientWidth || 200;
        const scale = cssWidth / unscaled.width;
        const viewport = pg.getViewport({ scale: scale * dpr });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        await pg.render({ canvasContext: ctx, viewport }).promise;
        if (alive) setReady(true);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [url, page]);

  return (
    <div ref={wrapRef} className="absolute inset-0 bg-white overflow-hidden flex items-start justify-center">
      {/* Faux-page fallback (shown until the real page renders, or on failure) */}
      {(!ready || failed) && (
        <span className="absolute inset-0 flex items-center justify-center bg-white">
          <span className="w-[88px] h-28 rounded-md bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] border border-[#edf0f3] p-2.5 flex flex-col gap-1.5">
            <span className="h-2 w-3/4 rounded bg-[#503DBB]/40" />
            <span className="h-1.5 w-full rounded bg-[#eef1f4]" />
            <span className="h-1.5 w-full rounded bg-[#eef1f4]" />
            <span className="h-1.5 w-5/6 rounded bg-[#eef1f4]" />
            <span className="h-1.5 w-2/3 rounded bg-[#eef1f4]" />
            <span className="mt-auto flex items-center gap-1 text-[#242473]"><FileText className="w-3 h-3" /><span className="text-[8px] font-bold tracking-wide">{label}</span></span>
          </span>
        </span>
      )}
      <canvas ref={canvasRef} className={ready && !failed ? 'block w-full' : 'hidden'} />
    </div>
  );
}
