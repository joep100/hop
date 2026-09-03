// api/address.js
//
// Forwards the Eircode lookup to the live Cyclone endpoint.
//
// Why this exists: booking.html calls "/api/address", a path relative to
// whatever domain serves the page. On cyclonelastmile.ie that resolves to the
// real function. On any other deployment it 404s, the fetch throws, and the
// tool shows "We couldn't reach the address system".
//
// Calling cyclonelastmile.ie straight from the browser would be blocked by
// CORS. This runs server-side, where CORS does not apply, so it can forward
// the request and hand the answer back as if it were local.
//
// Read-only. It cannot create a booking or touch a card.

const UPSTREAM = 'https://www.cyclonelastmile.ie/api/address';

export default async function handler(req, res) {
  const raw = (req.query.eircode || '').toString();
  const eircode = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

  if (eircode.length !== 7) {
    return res.status(400).json({ found: false, error: 'eircode must be 7 characters' });
  }

  // don't let a hung upstream hold the counter up
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const r = await fetch(`${UPSTREAM}?eircode=${encodeURIComponent(eircode)}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);

    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // upstream returned something that isn't JSON, which the tool must not
      // treat as a valid address
      return res.status(502).json({ found: false, error: 'bad response from address service' });
    }

    // brief cache: the same Eircode gets typed repeatedly at a counter
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');
    return res.status(r.status).json(data);

  } catch (err) {
    clearTimeout(timer);
    const aborted = err && err.name === 'AbortError';
    return res.status(504).json({
      found: false,
      error: aborted ? 'address service timed out' : 'address service unreachable'
    });
  }
}
