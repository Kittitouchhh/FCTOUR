// Tournament logic shared by the browser (window.Bracket) and Node tests (module.exports)
(function (root) {
  const BYE = 'BYE';

  const nextPow2 = (n) => { let p = 1; while (p < n) p *= 2; return p; };

  // Standard seeding order: 1 v N, 2 v N-1 ... spread so top seeds meet last
  function seedOrder(n) {
    let s = [1];
    while (s.length < n) {
      const m = s.length * 2 + 1;
      s = s.flatMap((x) => [x, m - x]);
    }
    return s;
  }

  function buildWinners(T, N) {
    const order = seedOrder(N);
    const k = Math.log2(N);
    const ms = [];
    for (let i = 0; i < N / 2; i++) {
      const sa = order[2 * i] - 1, sb = order[2 * i + 1] - 1;
      ms.push({ id: `W1-${i}`, br: 'W', round: 1, a: { team: sa < T ? sa : BYE }, b: { team: sb < T ? sb : BYE } });
    }
    for (let r = 2; r <= k; r++) {
      for (let i = 0; i < N / 2 ** r; i++) {
        ms.push({ id: `W${r}-${i}`, br: 'W', round: r, a: { w: `W${r - 1}-${2 * i}` }, b: { w: `W${r - 1}-${2 * i + 1}` } });
      }
    }
    return { ms, k };
  }

  function generateSingle(T) {
    const N = Math.max(2, nextPow2(T));
    const { ms, k } = buildWinners(T, N);
    return { matches: ms, rounds: { W: k }, final: `W${k}-0` };
  }

  function generateDouble(T, reset) {
    const N = Math.max(4, nextPow2(T));
    const { ms, k } = buildWinners(T, N);
    for (let j = 1; j <= k - 1; j++) {
      const c = N / 2 ** (j + 1);
      const odd = 2 * j - 1, even = 2 * j;
      for (let i = 0; i < c; i++) {
        if (j === 1) ms.push({ id: `L${odd}-${i}`, br: 'L', round: odd, a: { l: `W1-${2 * i}` }, b: { l: `W1-${2 * i + 1}` } });
        else ms.push({ id: `L${odd}-${i}`, br: 'L', round: odd, a: { w: `L${odd - 1}-${2 * i}` }, b: { w: `L${odd - 1}-${2 * i + 1}` } });
      }
      for (let i = 0; i < c; i++) {
        const idx = j % 2 === 1 ? c - 1 - i : i; // flip drop order to avoid instant rematches
        ms.push({ id: `L${even}-${i}`, br: 'L', round: even, a: { w: `L${odd}-${i}` }, b: { l: `W${j + 1}-${idx}` } });
      }
    }
    const lbFinal = `L${2 * (k - 1)}-0`;
    ms.push({ id: 'GF1', br: 'GF', round: 1, a: { w: `W${k}-0` }, b: { w: lbFinal } });
    if (reset) ms.push({ id: 'GF2', br: 'GF', round: 2, a: { w: `W${k}-0` }, b: { w: lbFinal }, reset: true });
    return { matches: ms, rounds: { W: k, L: 2 * (k - 1) }, final: reset ? 'GF2' : 'GF1' };
  }

  function generateRoundRobin(T, legs) {
    const ids = [...Array(T).keys()];
    if (T % 2) ids.push(null);
    const n = ids.length;
    const ms = [];
    const base = [];
    let arr = ids.slice();
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const x = arr[i], y = arr[n - 1 - i];
        if (x !== null && y !== null) pairs.push(r % 2 && i === 0 ? [y, x] : [x, y]);
      }
      base.push(pairs);
      arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
    }
    let round = 0;
    for (let leg = 0; leg < legs; leg++) {
      base.forEach((pairs) => {
        round++;
        pairs.forEach(([x, y], i) => {
          const [a, b] = leg % 2 ? [y, x] : [x, y];
          ms.push({ id: `R${round}-${i}`, br: 'R', round, a: { team: a }, b: { team: b } });
        });
      });
    }
    return { matches: ms, rounds: { R: round } };
  }

  function create({ name, mode, teams, shuffle, legs, reset }) {
    let list = teams.map((s) => String(s).trim()).filter(Boolean);
    if (shuffle) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    const T = list.length;
    let g;
    if (mode === 'double') g = generateDouble(T, !!reset);
    else if (mode === 'single') g = generateSingle(T);
    else g = generateRoundRobin(T, legs === 2 ? 2 : 1);
    return {
      name: String(name || 'FC Online Cup').trim(),
      mode,
      teams: list,
      options: { legs: legs === 2 ? 2 : 1, reset: !!reset },
      matches: g.matches,
      rounds: g.rounds,
      final: g.final || null,
      results: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };
  }

  // Work out who plays in every match, given the results entered so far
  function resolve(t) {
    const byId = {};
    t.matches.forEach((m) => (byId[m.id] = m));
    const memo = {};
    const results = t.results || {};

    const slot = (s) => {
      if ('team' in s) return s.team;
      const src = res(s.w || s.l);
      return s.w ? src.winner : src.loser;
    };

    function res(id) {
      if (memo[id]) return memo[id];
      const m = byId[id];
      const a = slot(m.a), b = slot(m.b);
      let out = { id, a, b, winner: null, loser: null, status: 'pending', s1: null, s2: null };

      if (m.reset) {
        const gf = res('GF1');
        if (gf.status !== 'done') return (memo[id] = { ...out, a: null, b: null });
        if (gf.winner === gf.a) return (memo[id] = { ...out, status: 'skip', a: gf.a, b: gf.b });
        out = { ...out, a: gf.a, b: gf.b };
      }
      const A = out.a, B = out.b;
      if (A === BYE && B === BYE) out = { ...out, winner: BYE, loser: BYE, status: 'bye' };
      else if (A === BYE && B !== null) out = { ...out, winner: B, loser: BYE, status: 'bye' };
      else if (B === BYE && A !== null) out = { ...out, winner: A, loser: BYE, status: 'bye' };
      else if (A === null || B === null || A === BYE || B === BYE) out.status = 'pending';
      else {
        out.status = 'ready';
        const r = results[id];
        if (r && r.ta === A && r.tb === B && Number.isFinite(r.s1) && Number.isFinite(r.s2)) {
          out.s1 = r.s1; out.s2 = r.s2; out.pw = r.pw || null;
          let w = null;
          if (r.s1 > r.s2) w = 'a';
          else if (r.s2 > r.s1) w = 'b';
          else if (m.br === 'R') w = 'draw';
          else if (r.pw === 'a' || r.pw === 'b') w = r.pw;
          if (w === 'draw') out = { ...out, status: 'done', draw: true };
          else if (w) out = { ...out, status: 'done', winner: w === 'a' ? A : B, loser: w === 'a' ? B : A };
        }
      }
      return (memo[id] = out);
    }

    const all = {};
    t.matches.forEach((m) => (all[m.id] = res(m.id)));

    let champion = null, runnerUp = null;
    if (t.mode === 'single') {
      const f = all[t.final];
      if (f.status === 'done' || f.status === 'bye') { champion = f.winner; runnerUp = f.loser; }
    } else if (t.mode === 'double') {
      const g1 = all.GF1, g2 = all.GF2;
      if (g1.status === 'done') {
        if (g1.winner === g1.a || !g2) { champion = g1.winner; runnerUp = g1.loser; }
        else if (g2.status === 'done') { champion = g2.winner; runnerUp = g2.loser; }
      } else if (g1.status === 'bye') champion = g1.winner;
    } else {
      const st = standings(t, all);
      const done = t.matches.every((m) => all[m.id].status === 'done');
      if (done && st.length) { champion = st[0].team; runnerUp = st[1] ? st[1].team : null; }
    }
    if (champion === BYE) champion = null;
    if (runnerUp === BYE) runnerUp = null;
    return { all, champion, runnerUp };
  }

  function standings(t, all) {
    const rows = t.teams.map((_, i) => ({ team: i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }));
    t.matches.forEach((m) => {
      const r = all[m.id];
      if (r.status !== 'done') return;
      const A = rows[r.a], B = rows[r.b];
      A.p++; B.p++;
      A.gf += r.s1; A.ga += r.s2; B.gf += r.s2; B.ga += r.s1;
      if (r.s1 > r.s2) { A.w++; B.l++; A.pts += 3; A.form.push('W'); B.form.push('L'); }
      else if (r.s2 > r.s1) { B.w++; A.l++; B.pts += 3; B.form.push('W'); A.form.push('L'); }
      else { A.d++; B.d++; A.pts++; B.pts++; A.form.push('D'); B.form.push('D'); }
    });
    rows.forEach((r) => (r.gd = r.gf - r.ga));
    return rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team - y.team);
  }

  function roundLabel(t, br, round) {
    if (br === 'R') return `นัดที่ ${round}`;
    if (br === 'GF') return round === 1 ? 'ชิงแชมป์' : 'ชิงแชมป์ (รีเซ็ต)';
    const total = t.rounds[br];
    const left = total - round;
    if (br === 'W') {
      const prefix = t.mode === 'double' ? 'สายบน · ' : '';
      if (left === 0) return t.mode === 'double' ? 'สายบน · ชิงสายบน' : 'นัดชิงชนะเลิศ';
      if (left === 1) return prefix + 'รองชนะเลิศ';
      if (left === 2) return prefix + 'รอบ 8 ทีม';
      if (left === 3) return prefix + 'รอบ 16 ทีม';
      return prefix + `รอบ ${2 ** (left + 1)} ทีม`;
    }
    if (left === 0) return 'สายล่าง · ชิงสายล่าง';
    return `สายล่าง · รอบ ${round}`;
  }

  const api = { BYE, create, resolve, standings, roundLabel, seedOrder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Bracket = api;
})(typeof window !== 'undefined' ? window : globalThis);
