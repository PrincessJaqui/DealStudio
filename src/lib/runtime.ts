/**
 * Where are we running, and what is our real address.
 *
 * The same bundle runs in three places now: a browser tab, an installed PWA, and
 * a Capacitor native shell. Two things differ between them and break silently if
 * you assume the browser case.
 *
 * 1. THE ORIGIN. In a browser, window.location.origin is https://dealstudio.io.
 *    Inside Capacitor it is capacitor://localhost (iOS) or http://localhost
 *    (Android): a real address on the device, and a nonsense address to anyone
 *    else. Every auth email, share link, and OAuth redirect has to point at the
 *    PUBLIC site, not at localhost, or the link in the email opens a page that
 *    only exists on the phone that sent it. WEB_ORIGIN is that public address,
 *    always, in every runtime.
 *
 * 2. THE ROUTER. BrowserRouter needs a server that rewrites every path to
 *    index.html. The native shell has no server: it loads a file. Clean paths
 *    like /admin then 404 to a blank screen. isNative decides HashRouter vs
 *    BrowserRouter in main.tsx.
 */

/** True inside a Capacitor shell. The global is injected by the native runtime;
 *  it is simply absent in a browser, so this is false on the web. */
export const isNative: boolean =
  typeof window !== 'undefined' &&
  !!(window as any).Capacitor?.isNativePlatform?.();

/**
 * The public web origin, no trailing slash. This is the address that must appear
 * in anything a person outside the app will click.
 *
 * On the web it is wherever the app is actually served, so previews and localhost
 * keep working. In the native shell there is no meaningful origin, so it falls
 * back to a build-time constant: set VITE_PUBLIC_ORIGIN in the native build, and
 * it is validated in Supabase's redirect allow-list.
 */
export const WEB_ORIGIN: string = (() => {
  const configured = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.replace(/\/$/, '');
  if (isNative) return configured || 'https://dealstudio.io';
  if (typeof window !== 'undefined') return window.location.origin;
  return configured || 'https://dealstudio.io';
})();

/** Join WEB_ORIGIN with a path. Use this for every auth redirect and shared link
 *  instead of `${window.location.origin}${path}`, which is the exact bug: it
 *  bakes capacitor://localhost into an email. */
export function webUrl(path = ''): string {
  return `${WEB_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
