// TRACE Acquisition OS V1 — Google Places secure discovery proxy
// Deploy as a Supabase Edge Function. Store GOOGLE_PLACES_API_KEY as a secret.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GOOGLE_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.regularOpeningHours',
  'places.priceLevel',
  'places.googleMapsUri',
  'places.businessStatus',
].join(',');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) return json({ error: 'GOOGLE_PLACES_API_KEY secret is not configured.' }, 503);

  try {
    const body = await req.json();
    if (body?.healthcheck) return json({ ok: true, provider: 'google_places_new' });

    const queries = Array.isArray(body?.queries) ? body.queries.slice(0, 8) : [];
    const centers = Array.isArray(body?.centers) ? body.centers.slice(0, 16) : [];
    if (!queries.length || !centers.length) {
      return json({ error: 'queries and centers are required.' }, 400);
    }

    const unique = new Map<string, any>();
    // One request per query/coverage point. We intentionally limit pagination to 1
    // page to keep V1 cost/latency predictable. The app can rerun discovery later.
    for (const center of centers) {
      if (typeof center?.lat !== 'number' || typeof center?.lng !== 'number') continue;
      for (const query of queries) {
        const payload = {
          textQuery: `${query} near ${center.name || 'Bogor'}`,
          languageCode: 'id',
          regionCode: 'ID',
          pageSize: 20,
          locationBias: {
            circle: {
              center: { latitude: center.lat, longitude: center.lng },
              radius: 6000,
            },
          },
        };

        const res = await fetch(GOOGLE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
          },
          body: JSON.stringify(payload),
        });

        const raw = await res.text();
        let data: any = {};
        try { data = JSON.parse(raw); } catch { /* handled below */ }
        if (!res.ok) {
          return json({
            error: `Google Places request failed (${res.status}).`,
            details: data?.error?.message || raw.slice(0, 300),
          }, 502);
        }

        for (const place of (data.places || [])) {
          if (place?.id) unique.set(place.id, place);
        }

        // Gentle pacing; do not hammer the provider.
        await sleep(120);
      }
    }

    return json({
      ok: true,
      provider: 'google_places_new',
      places: [...unique.values()],
      count: unique.size,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
