# Moodle-style maintenance page

This is a dependency-free static site for Netlify. It is designed to be fetched by a Cloudflare Worker while `write.rmtutoringservices.com` or `monitor.rmtutoringservices.com` is in maintenance mode.

Deploy with:

```sh
netlify deploy --prod --dir .
```

The Cloudflare Worker should fetch the resulting `https://<site>.netlify.app/` URL and return it with HTTP status `503`, preserving the learner's original URL.

`cloudflare-worker.js` is the complete Worker source for this project. It displays a full-page preloader while a background health check contacts the routed Lenovo origin. The preloader is shown at most once per browser session, and a successful check suppresses it for 15 minutes across sessions. Once the check finishes, it serves Lenovo when available or the Netlify maintenance page with HTTP status `503` when the origin is unavailable. No Worker variables or manual maintenance switch are required.

Attach the Worker only to these routes:

- `write.rmtutoringservices.com/*`
- `monitor.rmtutoringservices.com/*`

## Contact form

The contact form posts directly to FormSubmit and then redirects to `thanks.html`. It does not use Netlify Forms. FormSubmit will send `reuben.miller@wolfcreek.ab.ca` a one-time activation email after the first submitted request; approve it to begin receiving future requests.
