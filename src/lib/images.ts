/**
 * Image compression, in one place.
 *
 * Why this exists. A founder pulls a logo off a firm's website and gets whatever
 * that site serves its hero section: often a 2400px PNG weighing two or three
 * megabytes. The Deal Flow table then renders it in a 28 pixel circle. Twenty
 * investors on a deal is twenty of those, downloaded in full, decoded in full,
 * and thrown away at 28px. That is the whole of the slowdown.
 *
 * There is no such thing as converting an image to HTML. What actually makes an
 * image fast is three things, and this file does the first two:
 *
 *   1. RESIZE it to the size it is actually displayed at.
 *   2. RE-ENCODE it to WebP, which is roughly a quarter the size of the PNG for
 *      the same picture, and keeps transparency, which logos need.
 *   3. LAZY-LOAD it, which is a property on the <img> tag (see DealPeople).
 *
 * What this deliberately does NOT touch:
 *   - SVG. It is already tiny and it is vector; rasterising it would make it both
 *     bigger and worse.
 *   - GIF. Drawing it to a canvas keeps frame one and silently throws the
 *     animation away.
 *   - Anything that comes out BIGGER after compression, which happens with small
 *     images that are already optimised. The original is returned instead.
 */

/** Not every browser encodes WebP. Asked once, not per image. */
let webpOk: boolean | null = null;
function supportsWebp(): boolean {
  if (webpOk !== null) return webpOk;
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpOk = false;
  }
  return webpOk;
}

const SKIP = ['image/svg+xml', 'image/gif'];

/**
 * Shrink to fit `max` on the long edge and re-encode.
 *
 * 512 by default: every avatar in this product renders somewhere between 28 and
 * 96 pixels, so 512 is already generous for a 2x display, and it leaves room to
 * show the thing bigger later without going back to the founder for the file.
 */
export async function compressImage(
  file: File,
  { max = 512, quality = 0.82 }: { max?: number; quality?: number } = {},
): Promise<File> {
  if (!file.type.startsWith('image/') || SKIP.includes(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // No background is painted, so a transparent logo stays transparent.
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const type = supportsWebp() ? 'image/webp' : 'image/jpeg';
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, type, quality));
    if (!blob) return file;

    // A 4KB icon re-encoded can come out heavier than it went in. Keep whichever
    // is actually smaller, rather than assuming the new one wins.
    if (blob.size >= file.size) return file;

    const ext = type === 'image/webp' ? 'webp' : 'jpg';
    const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${stem}.${ext}`, { type });
  } catch {
    // A broken or exotic file is not worth blocking an upload over. Send the
    // original and let the bucket have it.
    return file;
  }
}

/**
 * Pull a remote image into our own storage, compressed.
 *
 * Returns null when the fetch is blocked, which is the common case: a site that
 * does not send CORS headers cannot be read by script, only displayed. The caller
 * then keeps the remote URL. That is not a failure, it just means the image stays
 * on someone else's server, at someone else's size.
 */
export async function fetchImageAsFile(url: string, name = 'logo'): Promise<File | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await compressImage(new File([blob], name, { type: blob.type }));
  } catch {
    return null;
  }
}
