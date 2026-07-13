/**
 * link-preview
 *
 * Fetches a URL server-side and returns its Open Graph title/description/image.
 * The browser cannot read another origin's HTML, so this has to happen here.
 *
 * The CORS preflight is the whole reason this file exists: without an OPTIONS
 * handler that returns 200 with the right headers, the browser blocks the call
 * before it is ever made, and the console reports a CORS error even though the
 * real problem is a missing function.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/** Pull one meta tag's content, tolerating attribute order and quote style. */
function meta(html: string, ...names: string[]): string {
  for (const name of names) {
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
        "i",
      ),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return decode(m[1].trim());
    }
  }
  return "";
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Anything that could reach inside the network. Checked on the URL the caller
 * gives us AND on every redirect hop.
 */
function isBlockedHost(hostRaw: string): boolean {
  const host = hostRaw.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".internal") ||
      host.endsWith(".local") || host.endsWith(".localhost")) return true;

  // IPv6 loopback, link-local, and unique-local.
  if (host === "::1" || host === "::" ) return true;
  if (/^fe80:/i.test(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;

  // IPv4, including the private ranges the old regex missed.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 127) return true;                 // this host, loopback
    if (a === 10) return true;                             // private
    if (a === 172 && b >= 16 && b <= 31) return true;      // private (was missed)
    if (a === 192 && b === 168) return true;               // private
    if (a === 169 && b === 254) return true;               // cloud metadata
    if (a >= 224) return true;                             // multicast, reserved
  }

  return false;
}

Deno.serve(async (req: Request) => {
  // Preflight must return an OK status, or the browser blocks the real request.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS });
  }

  try {
    const { url } = await req.json().catch(() => ({ url: "" }));

    if (!url || !/^https?:\/\//i.test(url)) {
      return json({ error: "a valid http(s) url is required" }, 400);
    }

    if (isBlockedHost(new URL(url).hostname)) {
      return json({ error: "blocked host" }, 400);
    }

    // Redirects are followed BY HAND, re-checking the host at every hop.
    // With redirect:"follow" a public URL could bounce to 169.254.169.254 and
    // read cloud metadata: the first check would pass and the fetch would still
    // land inside the network. This function is publicly callable, so that hole
    // is not acceptable.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    let target = url;
    let res: Response;

    try {
      for (let hop = 0; ; hop++) {
        if (hop > 3) return json({ error: "too many redirects" }, 200);

        res = await fetch(target, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            // Some sites serve nothing useful without a browser-ish UA.
            "User-Agent":
              "Mozilla/5.0 (compatible; DealStudioBot/1.0; +https://dealstudio.io)",
            Accept: "text/html,application/xhtml+xml",
          },
        });

        if (res.status < 300 || res.status >= 400) break;

        const loc = res.headers.get("location");
        if (!loc) break;

        target = new URL(loc, target).toString();
        if (!/^https?:\/\//i.test(target) || isBlockedHost(new URL(target).hostname)) {
          return json({ error: "blocked redirect" }, 400);
        }
      }
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return json({ error: `upstream ${res.status}` }, 200);

    // Only read the head; some pages are enormous.
    const html = (await res.text()).slice(0, 200_000);

    const title =
      meta(html, "og:title", "twitter:title") ||
      decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "");

    let image = meta(html, "og:image", "twitter:image", "og:image:url");
    if (image && !/^https?:\/\//i.test(image)) {
      try {
        image = new URL(image, res.url).href; // resolve relative image paths
      } catch {
        image = "";
      }
    }

    return json({
      title,
      description: meta(html, "og:description", "twitter:description", "description"),
      image,
      site: meta(html, "og:site_name") || new URL(res.url).hostname.replace(/^www\./, ""),
      url: res.url,
    });
  } catch (e) {
    // Never fail loudly: the client keeps whatever the user typed.
    return json({ error: String((e as Error)?.message ?? e) }, 200);
  }
});
