const PAGE = "https://rmt-maintenance.netlify.app/";

const FALLBACK = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maintenance</title><body><main><h1>We’ll be back shortly</h1><p>This portal is temporarily unavailable.</p></main></body></html>`;

export default {
  async fetch() {
    try {
      const upstream = await fetch(PAGE, {
        headers: { Accept: "text/html" },
        cf: { cacheTtl: 0, cacheEverything: false },
      });

      const cleaned = new HTMLRewriter()
        .on('script[src*="/.netlify/scripts/hud"]', {
          element(element) {
            element.remove();
          },
        })
        .transform(upstream);

      const headers = new Headers(upstream.headers);
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set("Cache-Control", "no-store, max-age=0");
      headers.set("Retry-After", "3600");
      headers.set("X-Robots-Tag", "noindex, nofollow");
      headers.delete("Content-Length");

      return new Response(cleaned.body, { status: 503, headers });
    } catch {
      return new Response(FALLBACK, {
        status: 503,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
          "Retry-After": "3600",
        },
      });
    }
  },
};
