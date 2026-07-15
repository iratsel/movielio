/**
 * Movielio — TMDb Proxy (Cloudflare Worker)
 * ==========================================
 * This is the ONLY way to genuinely keep your TMDb API key out of the
 * browser. It runs on Cloudflare's servers, holds the real key, and
 * forwards requests to TMDb on Movielio's behalf — visitors' browsers
 * only ever talk to this worker, never to TMDb directly, so the key never
 * appears in page source, DevTools, or the Network tab on their end.
 *
 * ---------------------------------------------------------------------
 * HOW TO DEPLOY (free, ~5 minutes, no credit card required)
 * ---------------------------------------------------------------------
 * 1. Go to https://dash.cloudflare.com/ and sign up / log in (free plan).
 * 2. In the sidebar, open "Workers & Pages" → click "Create" → "Create Worker".
 * 3. Give it a name, e.g. "movielio-proxy", then click "Deploy" to scaffold it.
 * 4. Click "Edit code", delete everything in the editor, and paste this
 *    entire file in its place.
 * 5. In the Worker's dashboard, go to Settings → Variables → "Add variable"
 *    under "Environment Variables". Add:
 *       Name:  TMDB_KEY
 *       Value: <your TMDb API Key (v3) or Read Access Token (v4)>
 *    Click "Encrypt" so it's stored as a secret, then Save and Deploy.
 * 6. Copy the worker's URL shown at the top, e.g.:
 *       https://movielio-proxy.yourname.workers.dev
 * 7. In index.html, set:
 *       const TMDB_PROXY_URL = "https://movielio-proxy.yourname.workers.dev";
 *    Leave TMDB_API_KEY as-is — it's ignored once TMDB_PROXY_URL is set.
 * 8. (Recommended) In Settings → Variables, also add ALLOWED_ORIGIN set to
 *    your published site's exact URL (e.g. https://yourdomain.com) so only
 *    your own site can use this worker — see the CORS check below.
 *
 * That's it — your TMDb key now lives only on Cloudflare's servers, never
 * in anything a visitor's browser can inspect.
 * ---------------------------------------------------------------------
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Basic CORS handling
    const allowedOrigin = env.ALLOWED_ORIGIN || "*"; // set ALLOWED_ORIGIN in Worker settings to lock this down
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (!env.TMDB_KEY) {
      return new Response(
        JSON.stringify({ error: "TMDB_KEY is not configured on this Worker. Add it under Settings → Variables." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Everything after the worker's own origin is forwarded to TMDb as-is,
    // e.g. /movie/popular?language=en-US -> https://api.themoviedb.org/3/movie/popular?language=en-US
    const tmdbUrl = new URL("https://api.themoviedb.org/3" + url.pathname + url.search);

    const isV4Token = env.TMDB_KEY.length > 60 || env.TMDB_KEY.split(".").length === 3;
    const headers = { accept: "application/json" };
    if (isV4Token) {
      headers["Authorization"] = `Bearer ${env.TMDB_KEY}`;
    } else {
      tmdbUrl.searchParams.set("api_key", env.TMDB_KEY);
    }

    try {
      const tmdbRes = await fetch(tmdbUrl.toString(), { headers });
      const body = await tmdbRes.text();
      return new Response(body, {
        status: tmdbRes.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=120", // light caching to reduce TMDb calls
          ...corsHeaders,
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to reach TMDb from the proxy.", detail: String(err) }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  },
};
