// api/address.js
//
// CommonJS on purpose. Vercel treats a .js file as CommonJS unless the repo has
// a package.json containing "type": "module". A static-site repo usually has no
// package.json at all, so "export default" is a syntax error there: the function
// crashes with a 500, the browser fetch throws, and the tool reports
// "We couldn't reach the address system" - the same message it shows for a
// missing endpoint. This version works either way.

const UPSTREAM = 'https://www.cyclonelastmile.ie/api/address';

module.exports = async (req, res) => {
  const raw = (req.query && req.query.eircode ? req.query.eircode : '').toString();
  const eircode = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

  // Visit /api/address?debug=1 to see what this function can actually reach.
  if (req.query && req.query.debug) {
    try {
      const r = await fetch(UPSTREAM + '?eircode=D02X285', { headers: { accept: 'application/json' } });
      const body = await r.text();
      return res.status(200).json({
        proxy: 'alive',
        node: process.version,
        upstream: UPSTREAM,
        upstreamStatus: r.status,
        upstreamContentType: r.headers.get('content-type'),
        upstreamFirst300: body.slice(0, 300)
      });
    } catch (e) {
      return res.status(200).json({
        proxy: 'alive',
        node: process.version,
        upstream: UPSTREAM,
        upstreamError: String((e && e.message) || e)
      });
    }
  }

  if (eircode.length !== 7) {
    return res.status(400).json({ found: false, error: 'eircode must be 7 characters' });
  }

  let timer;
  try {
    const controller = new AbortController();
    timer = setTimeout(function () { controller.abort(); }, 8000);

    const r = await fetch(UPSTREAM + '?eircode=' + encodeURIComponent(eircode), {
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);

    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({
        found: false,
        error: 'address service returned something that is not JSON',
        status: r.status
      });
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');
    return res.status(r.status).json(data);

  } catch (err) {
    if (timer) clearTimeout(timer);
    const aborted = err && err.name === 'AbortError';
    return res.status(504).json({
      found: false,
      error: aborted ? 'address service timed out' : 'address service unreachable',
      detail: String((err && err.message) || err)
    });
  }
};
