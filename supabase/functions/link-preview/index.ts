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

    // Block requests aimed at internal addresses (SSRF guard).
    const host = new URL(url).hostname;
    if (
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0)/i.test(host) ||
      host.endsWith(".internal") ||
      host.endsWith(".local")
    ) {
      return json({ error: "blocked host" }, 400);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Some sites serve nothing useful without a browser-ish UA.
        "User-Agent":
          "Mozilla/5.0 (compatible; DealStudioBot/1.0; +https://dealstudio.io)",
        Accept: "text/html,application/xhtml+xml",
      },
    }).finally(() => clearTimeout(timer));

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
