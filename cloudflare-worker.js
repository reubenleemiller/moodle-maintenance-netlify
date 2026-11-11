
const DEFAULT_MAINTENANCE_URL =
  "https://rmt-maintenance.netlify.app/";

const THANK_YOU_URL =
  "https://rmt-maintenance.netlify.app/thanks.html";

const PRELOAD_PARAMETER = "__rmt_preloaded";
const HEALTH_CHECK_PARAMETER = "__rmt_health_check";
const MAINTENANCE_PARAMETER = "__rmt_maintenance";
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

function isDocumentRequest(request) {
  return (
    request.method === "GET" &&
    request.headers.get("Accept")?.includes("text/html")
  );
}

function preloaderResponse(url) {
  const destination = new URL(url);
  destination.searchParams.set(PRELOAD_PARAMETER, "1");
  const healthCheckUrl = new URL(url);
  healthCheckUrl.searchParams.set(HEALTH_CHECK_PARAMETER, "1");

  const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Loading…</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #fff; color: #1d2125; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    main { display: grid; justify-items: center; gap: 1rem; padding: 2rem; text-align: center; }
    .spinner { width: 52px; height: 52px; border: 5px solid #cfe2f2; border-top-color: #0f6cbf; border-radius: 50%; animation: spin .8s linear infinite; }
    p { margin: 0; color: #6a737b; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2s; } }
  </style>
</head>
<body>
  <main aria-live="polite">
    <span class="spinner" aria-hidden="true"></span>
    <p>Loading the learning portal…</p>
  </main>
  <script>
    const destination = ${JSON.stringify(destination.href)};
    const healthCheckUrl = ${JSON.stringify(healthCheckUrl.href)};

    fetch(healthCheckUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    })
      .then((response) => response.json())
      .catch(() => ({ originAvailable: false }))
      .then(({ originAvailable }) => {
        const next = new URL(destination);
        if (!originAvailable) next.searchParams.set(${JSON.stringify(MAINTENANCE_PARAMETER)}, "1");
        location.replace(next);
      });
  </script>
</body>
</html>`;

  return new Response(page, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}

async function healthCheckResponse(request, url) {
  try {
    const headers = new Headers(request.headers);
    headers.set("Accept", "text/html");

    const originResponse = await fetchWithTimeout(
      new Request(url, { method: "GET", headers }),
      {},
      ORIGIN_TIMEOUT_MS
    );

    const originAvailable =
      !ORIGIN_ERROR_STATUSES.has(originResponse.status);
    originResponse.body?.cancel();

    return Response.json({ originAvailable }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return Response.json({ originAvailable: false }, {
      headers: { "Cache-Control": "no-store" }
    });
  }
}

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
    const hasShownPreloader =
      url.searchParams.get(PRELOAD_PARAMETER) === "1";
    const isHealthCheck =
      url.searchParams.get(HEALTH_CHECK_PARAMETER) === "1";
    const showMaintenance =
      url.searchParams.get(MAINTENANCE_PARAMETER) === "1";

    if (isHealthCheck) {
      url.searchParams.delete(HEALTH_CHECK_PARAMETER);
      return healthCheckResponse(request, url);
    }

    if (isDocumentRequest(request) && !hasShownPreloader) {
      return preloaderResponse(url);
    }

    // The preloader marker is only for the Worker; do not send it upstream.
    url.searchParams.delete(PRELOAD_PARAMETER);
    url.searchParams.delete(MAINTENANCE_PARAMETER);

    if (showMaintenance) {
      return maintenanceResponse();
    }

    // Thank-you page
    if (
      request.method === "GET" &&
      url.pathname === "/thanks.html"
    ) {
      return maintenanceResponse(THANK_YOU_URL, 200);
    }

    try {
      const originResponse = await fetchWithTimeout(
        new Request(url, request),
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
