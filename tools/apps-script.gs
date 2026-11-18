/**
 * Wódystopad 2026 — wspólna baza głosów (Google Apps Script, przypięty do arkusza).
 * Wdrożenie: Wdróż → Nowe wdrożenie → Aplikacja internetowa → Wykonuj jako: Ja, Dostęp: Każdy.
 * Adres /exec wklej do CONFIG.api w index.html.
 *
 * Arkusz „log”: każde zdarzenie ze strony w jednym wierszu (czas, wyborca, typ, dane JSON).
 * Arkusz „Podsumowanie”: czytelne zestawienie, odświeżane po każdym zapisie.
 * Typ 'score' — wyniki gry „Podwódne Przygody” (3 litery, punkty, rybki, nr mapy); strona dostaje top 15 w `scores`.
 * Typ 'score-g' — wyniki pozostałych gier z Wódystopad Game Store (pole g = id gry: 'polanie', 'wodzitsu'); strona dostaje top 15 każdej w `boards` (x = np. numer postaci w Wódżitsu).
 * Typ 'song' — Szafa grająca: piosenka z YouTube dodana do playlisty Wódzireja (v = id filmu, k = kto zamawia).
 *   Wymaga usługi zaawansowanej: Edytor → Usługi (+) → „YouTube Data API v3” (identyfikator: YouTube).
 *   Skrypt działa jako właściciel (Wykonuj jako: Ja), więc dodaje utwory do jego playlisty. Pierwsze uruchomienie: testSzafy().
 *   GET ?yt=search&q=… — wyniki wyszukiwania (albo jeden film, gdy q to link); GET ?yt=list — zawartość playlisty.
 * Typ 'whoami' — telefon wybrał legitymację (d.name = imię z CONFIG.people). Od tej chwili jego zdarzenia liczą się tej osobie
 *   (zdarzenia sprzed pierwszego wyboru — też). Strona dostaje statystyki osób w `people` (bez identyfikatorów telefonów).
 */
const LOG = 'log', SUM = 'Podsumowanie';
// ZEROWANIE „Co pijemy” (18.11): ankieta marek i Butelkomat liczą tylko zdarzenia od tej chwili (stare zostają w logu)
const RESET_ZAOP = new Date('2026-11-18T12:40:00Z').getTime();
const ZAOP = ['brand-add', 'brand-del', 'vote', 'bottle', 'set-add', 'set-del', 'set-vote'];
const ML = ['500', '700', '1000'];
/* Butelkomat: zestaw = ile butelek każdej pojemności, klucz „500:2|700:3” (bez zer) */
function setKey_(c) { return ML.map(m => [m, Math.max(0, Math.min(40, parseInt((c || {})[m], 10) || 0))]).filter(x => x[1]).map(x => x[0] + ':' + x[1]).join('|'); }
function setComp_(k) { const o = {}; String(k || '').split('|').forEach(p => { const a = p.split(':'); if (ML.indexOf(a[0]) >= 0) o[a[0]] = +a[1] || 0; }); return o; }
const GAMES = { polanie: 'OSTATNIE POLANIE', wodzitsu: 'WÓDŻITSU' }; // gry z biblioteki zapisywane jako 'score-g'
const GAME_F = { polanie: 'KIELONKI', wodzitsu: 'WYGRANE' };     // co znaczy pole f w danej grze (kolumna w Podsumowaniu)
const PLAYLIST = 'PLHXPoXasIR78';              // playlista „Wódystopad 2026” na YouTube Wódzireja
const SONG_LIMIT = { n: 6, min: 15 };          // maks. 6 piosenek z jednego telefonu w 15 minut

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

/* telefon → osoba: lista wyborów legitymacji w czasie (zmiana przez „To nie ja”) */
function ids_(evs) {
  const m = {};
  evs.forEach(e => { if (e.type !== 'whoami') return; const n = String(e.d.name || '').trim().slice(0, 30); if (n) (m[e.who] = m[e.who] || []).push({ t: +new Date(e.t) || 0, n: n }); });
  return m;
}
/* kto był na tym telefonie w chwili t (zdarzenia sprzed pierwszego wyboru → pierwsza wybrana osoba) */
function personAt_(ids, who, t) {
  const l = ids[who]; if (!l) return '';
  let n = l[0].n; for (let i = 0; i < l.length && l[i].t <= t; i++) n = l[i].n;
  return n;
}

function state_() {
  const brands = {}; const votes = {}; const bottles = {}; const sets = {}; const setVotes = {}; const oaths = {}; const scores = []; const boards = {}; Object.keys(GAMES).forEach(k => boards[k] = []); let fish = 0; const songs = [];
  const evs = events_(), ids = ids_(evs);
  const people = {}; const P = n => people[n] || (people[n] = { in: false, oath: false, vote: null, props: [], songs: 0, last: '', games: {} });
  Object.keys(ids).forEach(w => ids[w].forEach(x => P(x.n).in = true));
  evs.forEach(e => {
    const per = personAt_(ids, e.who, +new Date(e.t) || 0);
    if (ZAOP.indexOf(e.type) >= 0 && (+new Date(e.t) || 0) < RESET_ZAOP) return;   // sprzed zerowania
    if (e.type === 'set-add') {
      const k = setKey_(e.d.s); if (!k) return;
      if (!sets[k] || sets[k].gone) sets[k] = { k: k, owner: e.who, by: per, gone: false, t: +new Date(e.t) || 0 };
    } else if (e.type === 'set-del') {
      const st = sets[String(e.d.k || '')]; if (st && st.owner === e.who) st.gone = true;
    } else if (e.type === 'set-vote') {
      setVotes[per ? 'p:' + per : e.who] = e.d.k ? String(e.d.k) : null;
    } else if (e.type === 'brand-add') {
      const name = String(e.d.name || '').trim().slice(0, 40); if (!name) return;
      const key = name.toLowerCase();
      if (!brands[key] || brands[key].gone) brands[key] = { name, owner: e.who, by: per, gone: false };
    } else if (e.type === 'brand-del') {
      const b = brands[String(e.d.name || '').toLowerCase()];
      if (b && b.owner === e.who) b.gone = true;
    } else if (e.type === 'vote') {
      votes[per ? 'p:' + per : e.who] = e.d.name ? String(e.d.name).toLowerCase() : null;   // jedna osoba = jeden głos, nawet z dwóch telefonów
    } else if (e.type === 'bottle') {
      const n = Math.max(1, Math.min(40, parseInt(e.d.n, 10) || 0)); const ml = [500, 700, 1000].indexOf(+e.d.ml) >= 0 ? +e.d.ml : 700;
      bottles[e.who] = { n, ml, kto: String(e.d.kto || '').slice(0, 40) };
    } else if (e.type === 'oath') {
      oaths[e.who] = { imie: String(e.d.imie || '').slice(0, 60), ksywa: String(e.d.ksywa || '').slice(0, 40), per: per || '',
        urzeka: (Array.isArray(e.d.urzeka) ? e.d.urzeka : []).slice(0, 3).map(x => String(x || '').slice(0, 80)) };
      if (per) P(per).oath = true;
    } else if (e.type === 'score') {
      const n = String(e.d.n || '').toUpperCase().replace(/[^A-ZĄĆĘŁŃÓŚŹŻ0-9]/g, '').slice(0, 3); if (!n) return;
      const num = (v, max) => Math.max(0, Math.min(max, parseInt(v, 10) || 0));
      scores.push({ n, p: num(e.d.p, 99999), f: num(e.d.f, 999), m: num(e.d.m, 9999), who: e.who, per: per, t: +new Date(e.t) || 0 });
    } else if (e.type === 'score-g') {
      const gid = String(e.d.g || ''); if (!boards[gid]) return;
      const n = String(e.d.n || '').toUpperCase().replace(/[^A-ZĄĆĘŁŃÓŚŹŻ0-9]/g, '').slice(0, 3); if (!n) return;
      const num = (v, max) => Math.max(0, Math.min(max, parseInt(v, 10) || 0));
      boards[gid].push({ n, p: num(e.d.p, 99999), f: num(e.d.f, 999), x: num(e.d.x, 999), who: e.who, per: per, t: +new Date(e.t) || 0 });
    } else if (e.type === 'fish') {
      fish += Math.max(1, Math.min(5, parseInt(e.d.n, 10) || 1));
    } else if (e.type === 'song') {
      const k = String(e.d.k || '').slice(0, 30) || per;
      songs.push({ v: String(e.d.v || ''), k: k, t: String(e.d.t || ''), at: +new Date(e.t) || 0 });
      if (k) { P(k).songs++; P(k).last = String(e.d.t || ''); }
    }
  });
  // ankieta: głos i propozycje każdej osoby
  Object.keys(votes).forEach(k => { if (k.indexOf('p:') === 0 && votes[k]) { const b = brands[votes[k]]; P(k.slice(2)).vote = b && !b.gone ? b.name : null; } });
  Object.keys(brands).forEach(k => { const b = brands[k]; if (!b.gone && b.by) P(b.by).props.push(b.name); });
  // rekordy: najlepszy wynik osoby i jego miejsce w rejestrze
  const best = (list, g) => { list.slice().sort((a, b) => b.p - a.p || a.t - b.t).forEach((x, i) => { if (x.per && !P(x.per).games[g]) P(x.per).games[g] = { p: x.p, r: i + 1, of: list.length }; }); };
  best(scores, 'karafka'); Object.keys(boards).forEach(g => best(boards[g], g));
  const names = (map, k) => Object.keys(map).filter(w => map[w] === k && w.indexOf('p:') === 0).map(w => w.slice(2));
  const list = Object.keys(brands).filter(k => !brands[k].gone).map(k => ({
    name: brands[k].name, owner: brands[k].owner, by: brands[k].by || '',
    votes: Object.keys(votes).filter(w => votes[w] === k).length, voters: names(votes, k)
  }));
  const setList = Object.keys(sets).filter(k => !sets[k].gone).map(k => ({
    k: k, s: setComp_(k), owner: sets[k].owner, by: sets[k].by || '', t: sets[k].t,
    votes: Object.keys(setVotes).filter(w => setVotes[w] === k).length, voters: names(setVotes, k)
  })).sort((a, b) => b.votes - a.votes || a.t - b.t);
  return {
    brands: list,
    sets: setList,
    votes: votes,
    bottles: Object.keys(bottles).map(w => Object.assign({ who: w }, bottles[w])),
    oaths: Object.keys(oaths).map(w => Object.assign({ who: w }, oaths[w])),
    fish: fish,
    songs: songs,
    people: people,
    scores: scores.sort((a, b) => b.p - a.p || a.t - b.t),
    boards: Object.keys(boards).reduce((o, k) => (o[k] = boards[k].sort((a, b) => b.p - a.p || a.t - b.t), o), {})
  };
}

/* to, co widzi strona (bez imion i nazwisk z przysięg i bez mapy głosów) */
function public_(s) {
  return { brands: s.brands, sets: s.sets, people: s.people, bottles: s.bottles, sworn: s.oaths.map(o => o.who), fish: s.fish,
    scores: s.scores.slice(0, 15).map(x => ({ n: x.n, p: x.p, f: x.f, who: x.who })), games: s.scores.length,
    boards: Object.keys(s.boards).reduce((o, k) => (o[k] = s.boards[k].slice(0, 15).map(x => ({ n: x.n, p: x.p, f: x.f, x: x.x, who: x.who })), o), {}) };
}

function summary_(s) {
  const sh = sheet_(SUM); sh.clear();
  const rows = [['WÓDYSTOPAD 2026 — zestawienie', '', ''], ['', '', ''], ['MARKA', 'GŁOSY', '']];
  s.brands.slice().sort((a, b) => b.votes - a.votes).forEach(b => rows.push([b.name + (b.by ? ' (zgł. ' + b.by + ')' : ''), b.votes, b.voters.join(', ')]));
  rows.push(['', '', ''], ['BUTELKOMAT — ZESTAW', 'GŁOSY', 'LITRY · KTO GŁOSOWAŁ']);
  s.sets.forEach(x => { const l = ML.reduce((a, m) => a + (x.s[m] || 0) * m, 0) / 1000;
    rows.push([ML.filter(m => x.s[m]).map(m => x.s[m] + ' × ' + (m / 1000).toString().replace('.', ',') + ' l').join(' + ') + (x.by ? ' (zgł. ' + x.by + ')' : ''), x.votes, l + ' l · ' + x.voters.join(', ')]); });
  rows.push(['', '', ''], ['PRZYSIĘGI (IMIĘ · LEGITYMACJA)', 'KSYWA', 'CO URZEKA W WÓDZIREJU']);
  s.oaths.forEach(o => rows.push([o.imie + (o.per && o.per !== o.imie ? ' · ' + o.per : ''), o.ksywa, (o.urzeka || []).map((x, i) => (i + 1) + '. ' + x).join('   ')]));
  rows.push(['', '', ''], ['RYBKI (21.11)', s.fish, '']);
  rows.push(['', '', ''], ['PODWÓDNE PRZYGODY — TOP 10', 'PUNKTY', 'RYBKI']);
  s.scores.slice(0, 10).forEach((x, i) => rows.push([(i + 1) + '. ' + x.n, x.p, x.f]));
  Object.keys(GAMES).forEach(k => { rows.push(['', '', ''], [GAMES[k] + ' — TOP 10', 'PUNKTY', GAME_F[k] || 'WYNIK']);
    s.boards[k].slice(0, 10).forEach((x, i) => rows.push([(i + 1) + '. ' + x.n, x.p, x.f])); });
  rows.push(['', '', ''], ['SZAFA GRAJĄCA — ZAMÓWIENIA', 'KTO', '']);
  s.songs.forEach((x, i) => rows.push([(i + 1) + '. ' + x.t, x.k || '—', '']));
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(14);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.yt) return json_(yt_(p));
  return json_(Object.assign({ ok: true }, public_(state_())));
}

function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const list = Array.isArray(body.events) ? body.events : [body];
    const who = String(body.who || '').slice(0, 40);
    const ok = ['brand-add', 'brand-del', 'vote', 'bottle', 'set-add', 'set-del', 'set-vote', 'oath', 'fish', 'score', 'score-g', 'whoami'];
    const rows = list.filter(ev => ok.indexOf(ev.type) >= 0 && who).slice(0, 30)
      .map(ev => [new Date(), who, ev.type, JSON.stringify(ev.d || {}).slice(0, 500)]);
    if (rows.length) { const sh = sheet_(LOG); sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows); }
    const songEv = list.filter(ev => ev.type === 'song')[0];   // piosenka: najpierw YouTube, wiersz w logu tylko po udanym dodaniu
    const song = songEv && who ? addSong_(who, songEv.d || {}) : null;
    const s = state_(); summary_(s);
    return json_(Object.assign({ ok: true, saved: rows.length }, song ? { song: song } : {}, public_(s)));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
   SZAFA GRAJĄCA — YouTube (usługa zaawansowana „YouTube”)
   Limit YouTube: wyszukiwanie ~100 dziennie (dlatego wyniki w pamięci 6 h),
   dodanie do playlisty 50 jednostek, lista i szczegóły filmów po 1.
   ========================================================= */
function ytText_(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function ytDur_(iso) {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if (!m) return '';
  const h = +m[1] || 0, mi = +m[2] || 0, s = +m[3] || 0, p = n => ('0' + n).slice(-2);
  return h ? h + ':' + p(mi) + ':' + p(s) : mi + ':' + p(s);
}
function ytThumb_(sn) { const t = (sn && sn.thumbnails) || {}; return (t.medium || t.default || {}).url || ''; }

/* id filmu z linku (youtube.com/watch?v=, youtu.be/, /shorts/, music.youtube.com…) */
function ytId_(s) {
  const m = String(s || '').match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

/* szczegóły filmów: tytuł, kanał, czas, miniaturka — tylko te, które da się odtworzyć */
function ytVideos_(ids) {
  if (!ids.length) return [];
  const r = YouTube.Videos.list('snippet,contentDetails,status', { id: ids.join(','), maxResults: 50 });
  const by = {};
  (r.items || []).forEach(v => {
    if (v.status && v.status.privacyStatus === 'private') return;
    by[v.id] = { id: v.id, t: ytText_(v.snippet.title), ch: ytText_(v.snippet.channelTitle), img: ytThumb_(v.snippet), d: ytDur_(v.contentDetails && v.contentDetails.duration) };
  });
  return ids.filter(id => by[id]).map(id => by[id]);
}

function ytSearch_(q) {
  q = String(q || '').trim().replace(/\s+/g, ' ').slice(0, 80); if (q.length < 2) return [];
  const key = 'yts:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, q.toLowerCase(), Utilities.Charset.UTF_8));
  const c = CacheService.getScriptCache(), hit = c.get(key); if (hit) return JSON.parse(hit);
  const r = YouTube.Search.list('id', { q: q, type: 'video', maxResults: 8, regionCode: 'PL', relevanceLanguage: 'pl' });
  const out = ytVideos_((r.items || []).map(i => i.id && i.id.videoId).filter(Boolean));
  c.put(key, JSON.stringify(out), 21600);
  return out;
}

/* zawartość playlisty w kolejności odtwarzania (w pamięci 90 s, żeby telefony nie zjadały limitu) */
function ytList_(fresh) {
  const c = CacheService.getScriptCache();
  if (!fresh) { const hit = c.get('ytl'); if (hit) return JSON.parse(hit); }
  const items = []; let tok;
  do {
    const r = YouTube.PlaylistItems.list('snippet,contentDetails', { playlistId: PLAYLIST, maxResults: 50, pageToken: tok });
    (r.items || []).forEach(i => items.push({ id: i.contentDetails.videoId, t: ytText_(i.snippet.title), ch: ytText_(i.snippet.videoOwnerChannelTitle || '').replace(/ - Topic$/, ''), img: ytThumb_(i.snippet) }));
    tok = r.nextPageToken;
  } while (tok && items.length < 300);
  c.put('ytl', JSON.stringify(items), 90);
  return items;
}

function playlist_() {
  const who = {}, at = {};
  events_().forEach(e => { if (e.type === 'song' && e.d.v && !who[e.d.v]) { who[e.d.v] = String(e.d.k || '').slice(0, 30); at[e.d.v] = +new Date(e.t) || 0; } });
  return { songs: ytList_(false).map(s => Object.assign({ k: who[s.id] || '', at: at[s.id] || 0 }, s)), url: 'https://www.youtube.com/playlist?list=' + PLAYLIST };
}

function ytErr_(err) {
  const m = String(err && err.message || err);
  if (/YouTube is not defined/i.test(m)) return 'Szafa jeszcze niepodłączona — Wódzirej musi włączyć usługę YouTube w skrypcie.';
  if (/quota/i.test(m)) return 'YouTube mówi „dość na dziś” (limit wyszukiwań). Wklej link do piosenki zamiast szukać.';
  if (/playlist/i.test(m) && /(not ?found|forbidden|permission|insufficient)/i.test(m)) return 'YouTube nie wpuszcza do playlisty — Wódzirej musi sprawdzić uprawnienia.';
  return 'YouTube się zaciął: ' + m.slice(0, 140);
}

function yt_(p) {
  try {
    if (p.yt === 'search') { const id = ytId_(p.q); return { ok: true, items: id ? ytVideos_([id]) : ytSearch_(p.q) }; }
    if (p.yt === 'list') return Object.assign({ ok: true }, playlist_());
    return { ok: false, error: 'Nieznane polecenie szafy.' };
  } catch (err) {
    return { ok: false, error: ytErr_(err) };
  }
}

/* dodanie piosenki (wywoływane z doPost pod blokadą) */
function addSong_(who, d) {
  const v = String(d.v || ''), k = String(d.k || '').slice(0, 30);
  if (!/^[A-Za-z0-9_-]{11}$/.test(v)) return { v: v, st: 'error', msg: 'To nie wygląda na film z YouTube.' };
  try {
    const now = Date.now();
    const recent = events_().filter(e => e.type === 'song' && e.who === who && now - (+new Date(e.t) || 0) < SONG_LIMIT.min * 60000).length;
    if (recent >= SONG_LIMIT.n) return { v: v, st: 'limit' };
    if (ytList_(true).some(s => s.id === v)) return { v: v, st: 'dup' };
    const info = ytVideos_([v])[0];
    if (!info) return { v: v, st: 'error', msg: 'Nie ma takiego filmu (albo jest prywatny).' };
    YouTube.PlaylistItems.insert({ snippet: { playlistId: PLAYLIST, resourceId: { kind: 'youtube#video', videoId: v } } }, 'snippet');
    sheet_(LOG).appendRow([new Date(), who, 'song', JSON.stringify({ v: v, k: k, t: info.t }).slice(0, 500)]);
    CacheService.getScriptCache().remove('ytl');
    return { v: v, st: 'added', t: info.t };
  } catch (err) {
    return { v: v, st: 'error', msg: ytErr_(err) };
  }
}

/* uruchom raz w edytorze (▶ testSzafy) — Google poprosi o zgodę na YouTube; w dzienniku pojawi się zawartość playlisty */
function testSzafy() {
  const l = ytList_(true);
  Logger.log('Playlista %s: %s utworów. Pierwszy: %s', PLAYLIST, l.length, l.length ? l[0].t : '—');
}
