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
    setPos({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
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

    out.toBlob(
      (blob) => {
        setBusy(false);
        if (blob) onCropped(blob);
      },
      'image/png',
      0.95,
    );
  };

  const minZoom = img ? Math.max(SIZE / img.width, SIZE / img.height) * 0.5 : 0.1;
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
          Drag to move, zoom to fit. The square is what investors will see.
        </p>

        <div
          className="relative mx-auto rounded-2xl overflow-hidden border border-[#edf0f3] cursor-move select-none"
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
            onChange={(e) => setZoom(parseFloat(e.target.value))}
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
