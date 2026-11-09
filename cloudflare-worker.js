
const DEFAULT_MAINTENANCE_URL =
  "https://rmt-maintenance.netlify.app/";

const THANK_YOU_URL =
  "https://rmt-maintenance.netlify.app/thanks.html";

const ORIGIN_ERROR_STATUSES = new Set([
  500, 502, 503, 504,
  520, 521, 522, 523, 524, 525, 526, 527
]);

const ORIGIN_TIMEOUT_MS = 1000;
const MAINTENANCE_TIMEOUT_MS = 1000;

const FALLBACK_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Maintenance</title>
</head>
<body>
  <main>
    <h1>We’ll be back shortly</h1>
    <p>This learning service is temporarily unavailable. Please try again shortly.</p>
  </main>
</body>
</html>`;

async function fetchWithTimeout(resource, options, timeout) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function maintenanceResponse(
  pageUrl = DEFAULT_MAINTENANCE_URL,
  status = 503
) {
  try {
    const page = await fetchWithTimeout(
      pageUrl,
      {
        headers: { Accept: "text/html" },
        cf: {
          cacheTtl: 0,
          cacheEverything: false
        }
      },
      MAINTENANCE_TIMEOUT_MS
    );

    if (page.ok) {
      const headers = new Headers(page.headers);

      headers.set(
        "Content-Type",
        "text/html; charset=utf-8"
      );

      headers.set("Cache-Control", "no-store");
      headers.set("X-Robots-Tag", "noindex, nofollow");

      if (status === 503) {
        headers.set("Retry-After", "3600");
      }

      return new Response(page.body, {
        status,
        headers
      });
    }
  } catch {
    // Netlify unavailable: use embedded fallback.
  }

  return new Response(FALLBACK_PAGE, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      ...(status === 503
        ? { "Retry-After": "3600" }
        : {})
    }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Thank-you page
    if (
      request.method === "GET" &&
      url.pathname === "/thanks.html"
    ) {
      return maintenanceResponse(THANK_YOU_URL, 200);
    }

    try {
      const originResponse = await fetchWithTimeout(
        request,
        {},
        ORIGIN_TIMEOUT_MS
      );

      if (ORIGIN_ERROR_STATUSES.has(originResponse.status)) {
        return maintenanceResponse();
      }

      return originResponse;

    } catch {
      return maintenanceResponse();
    }
  }
};
