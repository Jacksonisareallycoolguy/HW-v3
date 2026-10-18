// Saves or removes this device's push address in Supabase. Uses plain REST calls, no extra packages.
const PASSCODE = process.env.PASSCODE || '';
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
// Only real browser push services are accepted as destinations.
const PUSH_HOST = /(^|\.)(push\.apple\.com|googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/i;

function sb(path, opts) {
  return fetch(SB_URL + '/rest/v1/' + path, Object.assign({}, opts, {
    headers: Object.assign({ apikey: SB_KEY, authorization: 'Bearer ' + SB_KEY, 'content-type': 'application/json' }, opts && opts.headers)
  }));
}
function validEndpoint(ep) {
  try { const u = new URL(ep); return u.protocol === 'https:' && PUSH_HOST.test(u.hostname) && ep.length < 1000; } catch { return false; }
}
function validTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return typeof tz === 'string' && tz.length < 60; } catch { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const json = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  if (req.method !== 'POST' && req.method !== 'DELETE') return json(405, { error: 'Use POST or DELETE.' });
  if (PASSCODE && req.headers['x-passcode'] !== PASSCODE) return json(401, { error: 'Wrong passcode.' });
  if (!SB_URL || !SB_KEY) return json(503, { error: 'The database is not connected yet (missing SUPABASE_URL or SUPABASE_SERVICE_KEY).' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    if (req.method === 'DELETE') {
      if (!validEndpoint(body.endpoint)) return json(400, { error: 'Bad endpoint.' });
      const r = await sb('push_subscriptions?endpoint=eq.' + encodeURIComponent(body.endpoint), { method: 'DELETE' });
      return r.ok ? json(200, { ok: true }) : json(502, { error: 'Could not remove this device.' });
    }
    const s = body.subscription || {};
    const k = s.keys || {};
    if (!validEndpoint(s.endpoint) || !k.p256dh || !k.auth) return json(400, { error: 'That notification address is not valid.' });
    const r = await sb('push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ endpoint: s.endpoint, p256dh: String(k.p256dh), auth: String(k.auth), user_agent: String(req.headers['user-agent'] || '').slice(0, 200) })
    });
    if (!r.ok) return json(502, { error: 'Could not save this device (database error ' + r.status + ').' });
    if (validTz(body.timezone)) {
      await sb('settings?id=eq.1', { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ timezone: body.timezone, updated_at: new Date().toISOString() }) });
    }
    json(200, { ok: true });
  } catch (e) {
    json(502, { error: 'Could not reach the database.' });
  }
};
