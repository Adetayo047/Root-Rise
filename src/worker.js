import { handleApplications } from './routes/applications.js';
import { handlePaystackWebhook } from './routes/webhooks.js';
import { handleAdmin } from './routes/admin.js';
import { json } from './lib/http.js';

// Only /api/* reaches this Worker (see run_worker_first in wrangler.jsonc).
// Everything else — the page, CSS, JS, images — is served straight from
// dist/ by Cloudflare's static assets.
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/webhooks/paystack') {
      return handlePaystackWebhook(request, env, ctx);
    }
    if (pathname === '/api/applications' || pathname.startsWith('/api/applications/')) {
      return handleApplications(request, env, ctx, pathname);
    }
    if (pathname.startsWith('/api/admin/')) {
      return handleAdmin(request, env, pathname);
    }
    if (pathname.startsWith('/api/')) {
      return json({ ok: false, error: 'Not found.' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
