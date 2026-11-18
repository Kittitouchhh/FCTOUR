// Shared storage for tournaments on Upstash Redis (add it from Vercel → Storage → Upstash / Redis).
// Works with either env naming: KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN.
// Optional: set EDIT_PIN to require a PIN for creating / editing / deleting.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PIN = process.env.EDIT_PIN || '';
const INDEX = 'fc:index';
const key = (id) => `fc:t:${id}`;

async function redis(...cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const getJSON = async (k) => { const v = await redis('GET', k); return v ? JSON.parse(v) : null; };
const setJSON = (k, v) => redis('SET', k, JSON.stringify(v));

const summary = (t, id) => ({
  id, name: t.name, mode: t.mode, teams: t.teams.length, createdAt: t.createdAt, updatedAt: t.updatedAt,
  champion: t.champion ?? null, stage: t.meta?.stage ?? null, played: t.meta?.played ?? null, total: t.meta?.total ?? null,
});
const cleanMeta = (m) => (m && typeof m === 'object'
  ? { stage: clean(m.stage, 60), played: Math.max(0, parseInt(m.played, 10) || 0), total: Math.max(0, parseInt(m.total, 10) || 0) }
  : null);
const clean = (s, n = 40) => String(s ?? '').trim().slice(0, n);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'NO_DB' });

  try {
    if (req.method === 'GET') {
      const id = req.query.id;
      if (id) {
        const t = await getJSON(key(id));
        return t ? res.json(t) : res.status(404).json({ error: 'NOT_FOUND' });
      }
      return res.json({ list: (await getJSON(INDEX)) || [], pinRequired: !!PIN });
    }

    if (req.method !== 'POST') return res.status(405).end();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (PIN && req.headers['x-pin'] !== PIN) return res.status(401).json({ error: 'BAD_PIN' });

    const { action, id } = body;

    if (action === 'checkPin') return res.json({ ok: true });

    if (action === 'create') {
      const t = body.tournament;
      if (!t || !Array.isArray(t.teams) || t.teams.length < 2 || t.teams.length > 64) return res.status(400).json({ error: 'BAD_INPUT' });
      if (!['single', 'double', 'rr'].includes(t.mode)) return res.status(400).json({ error: 'BAD_MODE' });
      const newId = Math.random().toString(36).slice(2, 8);
      t.name = clean(t.name, 60) || 'FC Online Cup';
      t.teams = t.teams.map((x) => clean(x));
      t.results = {};
      t.meta = cleanMeta(t.meta);
      t.champion = null;
      t.version = 1;
      t.createdAt = t.updatedAt = Date.now();
      await setJSON(key(newId), t);
      const list = (await getJSON(INDEX)) || [];
      list.unshift(summary(t, newId));
      await setJSON(INDEX, list.slice(0, 200));
      return res.json({ id: newId });
    }

    const t = id && (await getJSON(key(id)));
    if (!t) return res.status(404).json({ error: 'NOT_FOUND' });

    if (action === 'delete') {
      await redis('DEL', key(id));
      const list = ((await getJSON(INDEX)) || []).filter((x) => x.id !== id);
      await setJSON(INDEX, list);
      return res.json({ ok: true });
    }

    if (action === 'result') {
      const { matchId, result } = body;
      if (!t.matches.some((m) => m.id === matchId)) return res.status(400).json({ error: 'BAD_MATCH' });
      if (result === null) delete t.results[matchId];
      else {
        const s1 = Math.max(0, Math.min(99, parseInt(result.s1, 10)));
        const s2 = Math.max(0, Math.min(99, parseInt(result.s2, 10)));
        if (!Number.isFinite(s1) || !Number.isFinite(s2)) return res.status(400).json({ error: 'BAD_SCORE' });
        t.results[matchId] = { ta: result.ta, tb: result.tb, s1, s2, pw: result.pw === 'a' || result.pw === 'b' ? result.pw : null, at: Date.now() };
      }
    } else if (action === 'teams') {
      if (!Array.isArray(body.teams) || body.teams.length !== t.teams.length) return res.status(400).json({ error: 'BAD_TEAMS' });
      t.teams = body.teams.map((x, i) => clean(x) || t.teams[i]);
      if (body.name) t.name = clean(body.name, 60);
    } else if (action === 'draw') {
      // re-draw: new order of the same team names, only before any result is in
      if (Object.keys(t.results || {}).length) return res.status(409).json({ error: 'LOCKED' });
      const next = Array.isArray(body.teams) ? body.teams.map((x) => clean(x)) : [];
      const same = next.length === t.teams.length && [...next].sort().join('\n') === [...t.teams].sort().join('\n');
      if (!same) return res.status(400).json({ error: 'BAD_TEAMS' });
      t.teams = next;
    } else return res.status(400).json({ error: 'BAD_ACTION' });

    if (body.meta) t.meta = cleanMeta(body.meta);

    if ('champion' in body) t.champion = body.champion;
    t.version = (t.version || 0) + 1;
    t.updatedAt = Date.now();
    await setJSON(key(id), t);

    const list = (await getJSON(INDEX)) || [];
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) { list[i] = summary(t, id); await setJSON(INDEX, list); }
    return res.json({ ok: true, version: t.version });
  } catch (e) {
    return res.status(500).json({ error: 'SERVER', detail: String(e.message || e) });
  }
};
