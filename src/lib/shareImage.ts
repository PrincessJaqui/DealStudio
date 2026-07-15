/**
 * Deck -> share image.
 *
 * Renders the first page of a deck PDF to a 1200x630 PNG, the standard Open Graph
 * size, so a deal link pasted into iMessage, Slack, or LinkedIn shows the deck
 * instead of a generic logo.
 *
 * This runs in the BROWSER, at the moment a founder uploads or sets a deck. The
 * client already has pdf.js and a real canvas (see PdfThumbnail); doing it here
 * sidesteps a serverless PDF renderer, which on Vercel means a native canvas
 * dependency that fights the bundle size limit. The tradeoff: it only regenerates
 * when a deck is set through the app, which is exactly the moment we want it.
 *
 * The slide is drawn centered on a white 1200x630 canvas rather than stretched,
 * so a portrait or oddly-shaped first page is letterboxed, not distorted. First
 * impressions in a link preview should look composed, not squished.
 */

let pdfjsPromise: Promise<any> | null = null;
function getPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist');
      // @ts-ignore - Vite resolves ?url to the worker asset URL string.
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    })();
  }
  return pdfjsPromise;
}

const OG_W = 1200;
const OG_H = 630;

/**
 * Render page 1 of the PDF at `url` to a 1200x630 PNG File. Returns null on any
 * failure, a deck that will not render must not block the upload it rode in on.
 */
export async function deckShareImage(url: string): Promise<File | null> {
  try {
    const pdfjs = await getPdfjs();
    const doc = await pdfjs.getDocument({ url, disableAutoFetch: true, disableStream: false }).promise;
    const page = await doc.getPage(1);

    // Render the page at a scale that comfortably fills the OG frame, so the
    // downscale into it stays crisp rather than blocky.
    const base = page.getViewport({ scale: 1 });
    const scale = Math.max(OG_W / base.width, OG_H / base.height) * 1.1;
    const viewport = page.getViewport({ scale });

    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = Math.ceil(viewport.width);
    pageCanvas.height = Math.ceil(viewport.height);
    const pctx = pageCanvas.getContext('2d');
    if (!pctx) return null;
    await page.render({ canvasContext: pctx, viewport }).promise;

    // Compose onto the exact OG frame, white background, slide centered and
    // contained (letterboxed) so nothing is distorted.
    const out = document.createElement('canvas');
    out.width = OG_W;
    out.height = OG_H;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OG_W, OG_H);

    const fit = Math.min(OG_W / pageCanvas.width, OG_H / pageCanvas.height);
    const dw = pageCanvas.width * fit;
    const dh = pageCanvas.height * fit;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pageCanvas, (OG_W - dw) / 2, (OG_H - dh) / 2, dw, dh);

    const blob: Blob | null = await new Promise(res => out.toBlob(res, 'image/png', 0.92));
    if (!blob) return null;
    return new File([blob], 'share.png', { type: 'image/png' });
  } catch {
    return null;
  }
}
