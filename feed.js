// Vercel serverless function: fetches your Canvas calendar feed so the browser can read it.
const dns = require('dns').promises;
const net = require('net');

const PASSCODE = process.env.PASSCODE || ''; // optional but recommended
const MAX_BYTES = 5 * 1024 * 1024;

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:');
}

async function fetchFeed(raw) {
  let u;
  try { u = new URL(String(raw).replace(/^webcal:/i, 'https:')); } catch { throw [400, 'That does not look like a link.']; }
  if (u.protocol !== 'https:') throw [400, 'The link must use https.'];
  if (!/\/feeds\/calendars\/[^/]+\.ics$/i.test(u.pathname)) throw [400, 'That is not a Canvas calendar feed link (it should end in .ics).'];
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => { throw [502, 'Could not find that website.']; });
  if (!addrs.length || addrs.some(a => isPrivate(a.address))) throw [400, 'That address is not allowed.'];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(u, { redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': 'canvas-due/1.0', accept: 'text/calendar,*/*' } });
    if (r.status >= 300 && r.status < 400) throw [502, 'Canvas redirected the request. Re-copy the feed link from Canvas.'];
    if (!r.ok) throw [502, 'Canvas returned an error (' + r.status + '). The link may have been reset.'];
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) throw [502, 'The calendar is too large.'];
    const text = buf.toString('utf8');
    if (!text.includes('BEGIN:VCALENDAR')) throw [502, 'That link did not return a calendar.'];
    return text;
  } catch (e) {
    if (Array.isArray(e)) throw e;
    throw [502, e.name === 'AbortError' ? 'Canvas took too long to respond.' : 'Could not reach Canvas.'];
  } finally { clearTimeout(timer); }
}

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  const json = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (PASSCODE && req.headers['x-passcode'] !== PASSCODE) return json(401, { error: 'Wrong passcode.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  try {
    const text = await fetchFeed((body && body.url) || '');
    res.statusCode = 200;
    res.setHeader('content-type', 'text/calendar; charset=utf-8');
    res.end(text);
  } catch (e) {
    const [code, msg] = Array.isArray(e) ? e : [400, 'Bad request.'];
    json(code, { error: msg });
  }
};
