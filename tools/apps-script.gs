/**
 * Wódystopad 2026 — wspólna baza głosów (Google Apps Script, przypięty do arkusza).
 * Wdrożenie: Wdróż → Nowe wdrożenie → Aplikacja internetowa → Wykonuj jako: Ja, Dostęp: Każdy.
 * Adres /exec wklej do CONFIG.api w index.html.
 *
 * Arkusz „log”: każde zdarzenie ze strony w jednym wierszu (czas, wyborca, typ, dane JSON).
 * Arkusz „Podsumowanie”: czytelne zestawienie, odświeżane po każdym zapisie.
 * Typ 'score' — wyniki gry „Podwódne Przygody” (3 litery, punkty, rybki, nr mapy); strona dostaje top 15 w `scores`.
 * Typ 'score-g' — wyniki pozostałych gier z Wódystopad Game Store (pole g = id gry, np. 'polanie'); strona dostaje top 15 każdej w `boards`.
 */
const LOG = 'log', SUM = 'Podsumowanie';
const GAMES = { polanie: 'OSTATNIE POLANIE' }; // gry z biblioteki zapisywane jako 'score-g'

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (name === LOG) sh.appendRow(['czas', 'wyborca', 'typ', 'dane']);
  }
  return sh;
}

function events_() {
  const v = sheet_(LOG).getDataRange().getValues();
  return v.slice(1).map(r => ({ t: r[0], who: String(r[1]), type: String(r[2]), d: JSON.parse(r[3] || '{}') }));
}

function state_() {
  const brands = {}; const votes = {}; const bottles = {}; const oaths = {}; const scores = []; const boards = {}; Object.keys(GAMES).forEach(k => boards[k] = []); let fish = 0;
  events_().forEach(e => {
    if (e.type === 'brand-add') {
      const name = String(e.d.name || '').trim().slice(0, 40); if (!name) return;
      const key = name.toLowerCase();
      if (!brands[key] || brands[key].gone) brands[key] = { name, owner: e.who, gone: false };
    } else if (e.type === 'brand-del') {
      const b = brands[String(e.d.name || '').toLowerCase()];
      if (b && b.owner === e.who) b.gone = true;
    } else if (e.type === 'vote') {
      votes[e.who] = e.d.name ? String(e.d.name).toLowerCase() : null;
    } else if (e.type === 'bottle') {
      const n = Math.max(1, Math.min(40, parseInt(e.d.n, 10) || 0)); const ml = [500, 700, 1000].indexOf(+e.d.ml) >= 0 ? +e.d.ml : 700;
      bottles[e.who] = { n, ml, kto: String(e.d.kto || '').slice(0, 40) };
    } else if (e.type === 'oath') {
      oaths[e.who] = { imie: String(e.d.imie || '').slice(0, 60), ksywa: String(e.d.ksywa || '').slice(0, 40) };
    } else if (e.type === 'score') {
      const n = String(e.d.n || '').toUpperCase().replace(/[^A-ZĄĆĘŁŃÓŚŹŻ0-9]/g, '').slice(0, 3); if (!n) return;
      const num = (v, max) => Math.max(0, Math.min(max, parseInt(v, 10) || 0));
      scores.push({ n, p: num(e.d.p, 99999), f: num(e.d.f, 999), m: num(e.d.m, 9999), who: e.who, t: +new Date(e.t) || 0 });
    } else if (e.type === 'score-g') {
      const gid = String(e.d.g || ''); if (!boards[gid]) return;
      const n = String(e.d.n || '').toUpperCase().replace(/[^A-ZĄĆĘŁŃÓŚŹŻ0-9]/g, '').slice(0, 3); if (!n) return;
      const num = (v, max) => Math.max(0, Math.min(max, parseInt(v, 10) || 0));
      boards[gid].push({ n, p: num(e.d.p, 99999), f: num(e.d.f, 999), x: num(e.d.x, 999), who: e.who, t: +new Date(e.t) || 0 });
    } else if (e.type === 'fish') {
      fish += Math.max(1, Math.min(5, parseInt(e.d.n, 10) || 1));
    }
  });
  const list = Object.keys(brands).filter(k => !brands[k].gone).map(k => ({
    name: brands[k].name, owner: brands[k].owner,
    votes: Object.keys(votes).filter(w => votes[w] === k).length
  }));
  return {
    brands: list,
    votes: votes,
    bottles: Object.keys(bottles).map(w => Object.assign({ who: w }, bottles[w])),
    oaths: Object.keys(oaths).map(w => Object.assign({ who: w }, oaths[w])),
    fish: fish,
    scores: scores.sort((a, b) => b.p - a.p || a.t - b.t),
    boards: Object.keys(boards).reduce((o, k) => (o[k] = boards[k].sort((a, b) => b.p - a.p || a.t - b.t), o), {})
  };
}

/* to, co widzi strona (bez imion i nazwisk z przysięg i bez mapy głosów) */
function public_(s) {
  return { brands: s.brands, bottles: s.bottles, sworn: s.oaths.map(o => o.who), fish: s.fish,
    scores: s.scores.slice(0, 15).map(x => ({ n: x.n, p: x.p, f: x.f, who: x.who })), games: s.scores.length,
    boards: Object.keys(s.boards).reduce((o, k) => (o[k] = s.boards[k].slice(0, 15).map(x => ({ n: x.n, p: x.p, f: x.f, who: x.who })), o), {}) };
}

function summary_(s) {
  const sh = sheet_(SUM); sh.clear();
  const rows = [['WÓDYSTOPAD 2026 — zestawienie', '', ''], ['', '', ''], ['MARKA', 'GŁOSY', '']];
  s.brands.slice().sort((a, b) => b.votes - a.votes).forEach(b => rows.push([b.name, b.votes, '']));
  rows.push(['', '', ''], ['ILE BUTELEK (propozycja)', 'POJEMNOŚĆ', 'LITRY']);
  s.bottles.forEach(b => rows.push([b.n + ' szt.' + (b.kto ? ' — ' + b.kto : ''), b.ml / 1000 + ' l', b.n * b.ml / 1000]));
  rows.push(['', '', ''], ['PRZYSIĘGI', 'KSYWA', '']);
  s.oaths.forEach(o => rows.push([o.imie, o.ksywa, '']));
  rows.push(['', '', ''], ['RYBKI (21.11)', s.fish, '']);
  rows.push(['', '', ''], ['PODWÓDNE PRZYGODY — TOP 10', 'PUNKTY', 'RYBKI']);
  s.scores.slice(0, 10).forEach((x, i) => rows.push([(i + 1) + '. ' + x.n, x.p, x.f]));
  Object.keys(GAMES).forEach(k => { rows.push(['', '', ''], [GAMES[k] + ' — TOP 10', 'PUNKTY', 'KIELONKI']);
    s.boards[k].slice(0, 10).forEach((x, i) => rows.push([(i + 1) + '. ' + x.n, x.p, x.f])); });
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(14);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_(Object.assign({ ok: true }, public_(state_())));
}

function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const list = Array.isArray(body.events) ? body.events : [body];
    const who = String(body.who || '').slice(0, 40);
    const ok = ['brand-add', 'brand-del', 'vote', 'bottle', 'oath', 'fish', 'score', 'score-g'];
    const rows = list.filter(ev => ok.indexOf(ev.type) >= 0 && who).slice(0, 30)
      .map(ev => [new Date(), who, ev.type, JSON.stringify(ev.d || {}).slice(0, 500)]);
    if (rows.length) { const sh = sheet_(LOG); sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows); }
    const s = state_(); summary_(s);
    return json_(Object.assign({ ok: true, saved: rows.length }, public_(s)));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
