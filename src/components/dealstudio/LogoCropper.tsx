/**
 * LogoCropper — crop and zoom a logo to a square before it is uploaded.
 *
 * The old flow uploaded whatever file was picked and letterboxed it with
 * object-contain, so a wide logo sat in a box with dead space either side. Here
 * the image is cropped to a square on a canvas and the square is what gets
 * stored, so it fills its container everywhere it appears.
 *
 * Transparency is preserved: the canvas is left unpainted and exported as PNG,
 * so a logo with a transparent background stays transparent.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, X, ZoomIn, RotateCcw } from 'lucide-react';

/** Asked once, not per crop. Old Safari cannot encode WebP; it falls back to PNG. */
let webpOk: boolean | null = null;
function canWebp(): boolean {
  if (webpOk !== null) return webpOk;
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  return webpOk;
}

const SIZE = 320;       // on-screen crop window
const EXPORT = 512;     // exported square, in pixels

export function LogoCropper({
  file,
  onCancel,
  onCropped,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load the picked file into an image element.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      // Start at "cover": the smaller side fills the square.
      const base = Math.max(SIZE / image.width, SIZE / image.height);
      setZoom(base);
      setPos({ x: (SIZE - image.width * base) / 2, y: (SIZE - image.height * base) / 2 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /**
   * Keep the square covered.
   *
   * The image's left edge can never be right of the frame's left edge, and its
   * right edge can never be left of the frame's right edge. Clamping here rather
   * than at each call site means there is no path -- drag, zoom, reset -- that can
   * leave a gap in the corner.
   */
  const clamp = (x: number, y: number, z: number) => {
    if (!img) return { x, y };
    const w = img.width * z;
    const h = img.height * z;
    return {
      // min is negative (image is larger than the frame), max is 0.
      x: Math.min(0, Math.max(SIZE - w, x)),
      y: Math.min(0, Math.max(SIZE - h, y)),
    };
  };

  /**
   * Zoom about the centre of the frame, not its top-left corner.
   *
   * Scaling from the origin walks whatever you were looking at off toward the
   * corner: you zoom in on a face and the face slides away. Anchoring the frame's
   * midpoint keeps the subject where you put it.
   */
  const zoomTo = (next: number) => {
    const c = SIZE / 2;
    const k = next / zoom;
    const p = clamp(c - (c - pos.x) * k, c - (c - pos.y) * k, next);
    setZoom(next);
    setPos(p);
  };

  // Paint the preview.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, pos.x, pos.y, img.width * zoom, img.height * zoom);
  }, [img, zoom, pos]);

  const onDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setPos(clamp(
      drag.current.ox + (e.clientX - drag.current.x),
      drag.current.oy + (e.clientY - drag.current.y),
      zoom,
    ));
  };
  const onUp = () => { drag.current = null; };

  const reset = () => {
    if (!img) return;
    const base = Math.max(SIZE / img.width, SIZE / img.height);
    setZoom(base);
    setPos({ x: (SIZE - img.width * base) / 2, y: (SIZE - img.height * base) / 2 });
  };

  const apply = async () => {
    if (!img) return;
    setBusy(true);
    const out = document.createElement('canvas');
    out.width = EXPORT;
    out.height = EXPORT;
    const ctx = out.getContext('2d');
    if (!ctx) { setBusy(false); return; }

    // Scale the on-screen crop up to the export size. No background is painted,
    // so transparency survives.
    const k = EXPORT / SIZE;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, pos.x * k, pos.y * k, img.width * zoom * k, img.height * zoom * k);

    // WebP, not PNG. Same 512px square, same transparency, roughly a quarter of
    // the bytes. Every team photo and company logo in the product comes through
    // this one export, so this is the place to pay for it once.
    const type = canWebp() ? 'image/webp' : 'image/png';
    out.toBlob(
      (blob) => {
        setBusy(false);
        if (blob) onCropped(blob);
      },
      type,
      type === 'image/webp' ? 0.85 : 0.95,
    );
  };

  // Cover, exactly. It used to be cover * 0.5, which let the image shrink
  // smaller than the frame -- at which point no clamp can prevent a gap, because
  // the image is simply not big enough to fill it.
  const minZoom = img ? Math.max(SIZE / img.width, SIZE / img.height) : 0.1;
  const maxZoom = img ? Math.max(SIZE / img.width, SIZE / img.height) * 4 : 4;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onCancel} />

      <div className="relative w-full max-w-md rounded-2xl bg-white border border-[#edf0f3] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.3)] p-6">
        <button
          onClick={onCancel}
          disabled={busy}
          aria-label="Close"
          className="absolute right-4 top-4 text-[#7f8c85] hover:text-[#191f1d]"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-bold text-[#191f1d]">Position your logo</h2>
        <p className="text-sm text-[#7f8c85] mt-1 mb-4">
          Drag to move, zoom to fit. This circle is what investors will see.
        </p>

        <div
          className="relative mx-auto rounded-full overflow-hidden border border-[#edf0f3] cursor-move select-none"
          style={{
            width: SIZE,
            height: SIZE,
            // Checkerboard so a transparent logo is obviously transparent.
            backgroundImage:
              'linear-gradient(45deg,#eef0f3 25%,transparent 25%),linear-gradient(-45deg,#eef0f3 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eef0f3 75%),linear-gradient(-45deg,transparent 75%,#eef0f3 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0,0 8px,8px -8px,-8px 0px',
          }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
        >
          {!img && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#7f8c85]" />
            </div>
          )}
          <canvas ref={canvasRef} width={SIZE} height={SIZE} className="block" />
        </div>

        <div className="flex items-center gap-3 mt-4">
          <ZoomIn className="w-4 h-4 shrink-0 text-[#7f8c85]" />
          <input
            type="range"
            min={minZoom}
            max={maxZoom}
            step={0.01}
            value={zoom}
            onChange={(e) => zoomTo(parseFloat(e.target.value))}
            className="flex-1 accent-[var(--ds-brand)]"
          />
          <button
            onClick={reset}
            aria-label="Reset"
            className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-[#7f8c85] hover:bg-[#f5f6f8]"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 h-10 rounded-xl border border-[#edf0f3] text-sm font-semibold text-[#7f8c85] hover:text-[#191f1d]"
          >
            Cancel
          </button>
          <button
            onClick={() => void apply()}
            disabled={busy || !img}
            className="flex-1 h-10 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Use this
          </button>
        </div>
      </div>
    </div>
  );
}
