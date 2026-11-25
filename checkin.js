// Breaking Bread check-in for Actualize crews. Men never sign in.
//   #k=<key>[&d=<phone>] his own private link: tonight's answers, the kept question, the weekly check-in, and on the
//                        one phone he chose, his own space with his answers over time next to the crew's averages
//   #t=<dinner>.<code>   the table QR code: he picks his name, or a phone that knows him goes straight in
// A link opened anywhere else only takes answers. Nothing is read back except on the phone he chose.
(function () {
  'use strict';
  var CFG = window.CREWS_CONFIG || {};
  var AREAS = [
    ['money', 'Money', 'MON'], ['career', 'Career', 'CAR'], ['health', 'Health', 'HEA'],
    ['fun', 'Fun', 'FUN'], ['environment', 'Environment', 'ENV'], ['community', 'Community', 'COM'],
    ['family', 'Family', 'FAM'], ['partner', 'Partner', 'PAR'], ['growth', 'Growth', 'GRO']
  ];
  var $ = function (id) { return document.getElementById(id); };

  // ---- the database ----
  function rpc(fn, args) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : null;
    return fetch(CFG.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      return res.text().then(function (t) {
        var body = null;
        try { body = t ? JSON.parse(t) : null; } catch (e) { body = null; }
        if (!res.ok) {
          var err = new Error((body && (body.message || body.msg)) || ('error ' + res.status));
          err.refused = true;
          throw err;
        }
        return body;
      });
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  // ---- this phone ----
  // ac-me keeps his link and this phone's own secret, once he says this is his phone. The secret also rides in the
  // address after #, so a home-screen icon (which on iPhone keeps its own storage) still opens his space.
  function stored(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function newSecret() {
    var a = new Uint8Array(32); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // ---- where we are ----
  var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  var ctx = { mode: null, phone: 'none' };
  if (hash.get('k')) { ctx.mode = 'link'; ctx.key = hash.get('k'); }
  else if (hash.get('t')) { var tp = hash.get('t').split('.'); ctx.mode = 'table'; ctx.dinnerKey = tp[0]; ctx.code = tp[1] || ''; }
  else { var me0 = stored('ac-me'); if (me0 && me0.key) { ctx.mode = 'link'; ctx.key = me0.key; } }
  function phoneSecret() {
    if (hash.get('d') && hash.get('k') === ctx.key) return hash.get('d');
    var me = stored('ac-me'); return me && me.key === ctx.key ? me.device : null;
  }
  function remember() {
    store('ac-me', { key: ctx.key, device: ctx.device, first: ctx.first });
    try { history.replaceState(null, '', location.pathname + location.search + '#k=' + ctx.key + '&d=' + ctx.device); } catch (e) {}
  }

  function tzOf() { return ctx.tz || undefined; }
  function when(iso, tz) {
    if (!iso) return '';
    try { return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz || undefined }).format(new Date(iso)).replace(',', ''); }
    catch (e) { return new Date(iso).toDateString(); }
  }
  function timeOf(iso) {
    try { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzOf() }).format(new Date(iso)).toLowerCase().replace(/ /g, ' '); }
    catch (e) { return ''; }
  }
  function shortDay(t) { try { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tzOf() }).format(new Date(t)); } catch (e) { return ''; } }
  function nextDinnerName() { return ctx.dinner ? 'dinner ' + (ctx.dinner.n + 1) : 'the next dinner'; }

  // ---- answers in progress, kept on this phone only until they're in ----
  function blank() { return { scores: {}, problem: '', area: '', commitment: '', by_when: '', offer: '', share: '', arrive: null, close: null }; }
  function storeKey() { return 'ac-checkin:' + (ctx.dinner ? ctx.dinner.key : 'none') + ':' + (ctx.mode === 'link' ? 'me' : ctx.person); }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(storeKey()) || 'null'); if (s && s.scores) return s; } catch (e) {}
    return blank();
  }
  function save() { if (ctx.pulse || !ctx.dinner || (ctx.mode === 'table' && !ctx.person)) return; try { localStorage.setItem(storeKey(), JSON.stringify(st)); } catch (e) {} }
  function forget() { try { localStorage.removeItem(storeKey()); } catch (e) {} }
  var st = blank();

  // ---- screens ----
  function show(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('on');
    var el = $('s-' + name);
    el.classList.add('on');
    var h = el.querySelector('h1,h2');
    if (h) setTimeout(function () { h.focus({ preventScroll: true }); }, 30);
    window.scrollTo(0, 0);
  }
  function say(msg) { $('live').textContent = msg; }
  function note(kicker, title, body, foot, next) {
    $('noteKicker').textContent = kicker; $('h-note').textContent = title; $('noteBody').textContent = body || '';
    $('noteFoot').textContent = foot || (ctx.mode === 'link' && ctx.phone === 'other' ? 'Your space, with your answers, opens on the phone you chose. Here you can still answer.' : '');
    $('noteNext').hidden = !next; $('noteNext').onclick = next || null;
    $('noteVs').hidden = true; $('noteVs').textContent = '';
    $('noteHome').hidden = !(ctx.mode === 'link' && ctx.phone === 'this');
    $('noteRemember').hidden = !(ctx.mode === 'link' && ctx.phone === 'none');
    show('note');
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }

  // ---- the wheel ----
  function buildWheel(host, scale) {
    var w = document.createElement('div');
    w.className = 'wheel';
    w.setAttribute('aria-hidden', 'true');
    if (scale) w.style.transform = 'scale(' + scale + ')';
    var glow = document.createElement('div'); glow.className = 'glow w-glow'; w.appendChild(glow);
    var spin = document.createElement('div'); spin.className = 'ring-deco w-spin'; w.appendChild(spin);
    [[20, 200], [48, 144], [76, 88]].forEach(function (r) {
      var ring = document.createElement('div'); ring.className = 'w-ring';
      ring.style.left = r[0] + 'px'; ring.style.top = r[0] + 'px'; ring.style.width = r[1] + 'px'; ring.style.height = r[1] + 'px';
      if (scale) ring.style.borderWidth = Math.round(1 / scale) + 'px';
      w.appendChild(ring);
    });
    var fills = {}; var codes = {};
    AREAS.forEach(function (a, i) {
      var spoke = document.createElement('div'); spoke.className = 'spoke'; spoke.style.transform = 'rotate(' + (i * 40) + 'deg)';
      var slot = document.createElement('div'); slot.className = 'slot'; spoke.appendChild(slot);
      var fill = document.createElement('div'); fill.className = 'fill'; spoke.appendChild(fill);
      w.appendChild(spoke); fills[a[0]] = fill;
      var rad = i * 40 * Math.PI / 180;
      var code = document.createElement('span'); code.className = 'code'; code.textContent = a[2];
      code.style.left = Math.round(120 + 114 * Math.sin(rad) - 14) + 'px';
      code.style.top = Math.round(120 - 114 * Math.cos(rad) - 6) + 'px';
      w.appendChild(code); codes[a[0]] = code;
    });
    var centre = document.createElement('div'); centre.className = 'centre';
    var b = document.createElement('b'); b.textContent = '·'; var sp = document.createElement('span'); sp.textContent = 'Tonight';
    centre.appendChild(b); centre.appendChild(sp); w.appendChild(centre);
    host.appendChild(w);
    return { fills: fills, codes: codes, avg: b, label: sp };
  }
  var wheels = [];
  function paint(active) {
    var low = lowest(); var a = average();
    wheels.forEach(function (wh) {
      AREAS.forEach(function (ar) {
        var k = ar[0]; var v = st.scores[k]; var f = wh.fills[k];
        f.style.transform = 'scaleY(' + (v ? v / 5 : 0) + ')';
        f.classList.toggle('low', !!(low && k === low.key && k !== active));
        f.classList.toggle('active', k === active);
        wh.codes[k].classList.toggle('low', !!(low && k === low.key));
        wh.codes[k].classList.toggle('active', k === active);
      });
      wh.avg.textContent = a === null ? '·' : a.toFixed(1);
    });
  }
  function setCount() { return AREAS.filter(function (a) { return !!st.scores[a[0]]; }).length; }
  function average() {
    var vals = AREAS.map(function (a) { return st.scores[a[0]]; }).filter(Boolean);
    if (!vals.length) return null;
    return Math.round(vals.reduce(function (s, v) { return s + v; }, 0) / vals.length * 10) / 10;
  }
  function avgOf(obj) {
    var vals = AREAS.map(function (a) { return obj && obj[a[0]]; }).filter(function (v) { return v !== null && v !== undefined; }).map(Number);
    return vals.length ? vals.reduce(function (s, v) { return s + v; }, 0) / vals.length : null;
  }
  function lowest() {
    var best = null;
    AREAS.forEach(function (a) { var v = st.scores[a[0]]; if (v && (!best || v < best.v)) best = { key: a[0], label: a[1], v: v }; });
    return best;
  }
  function labelOf(key) { var f = AREAS.filter(function (a) { return a[0] === key; })[0]; return f ? f[1] : ''; }
  function bloom(wh) {
    AREAS.forEach(function (a) { var f = wh.fills[a[0]]; f.style.transition = 'none'; f.style.transform = 'scaleY(0)'; });
    void wh.avg.offsetWidth;
    AREAS.forEach(function (a, i) {
      var f = wh.fills[a[0]]; var v = st.scores[a[0]];
      f.style.transition = '';
      f.style.transitionDelay = (0.1 + 0.07 * i).toFixed(2) + 's';
      f.style.transform = 'scaleY(' + (v ? v / 5 : 0) + ')';
    });
    setTimeout(function () { AREAS.forEach(function (a) { wh.fills[a[0]].style.transitionDelay = ''; }); }, 1500);
  }

  // ---- him next to the crew: his bar, the crew's average as a line ----
  function vsRows(box, mine, crew) {
    var lows = AREAS.filter(function (a) { return mine[a[0]]; }).map(function (a) { return Number(mine[a[0]]); });
    var lo = lows.length ? Math.min.apply(null, lows) : null;
    var single = AREAS.filter(function (a) { return Number(mine[a[0]]) === lo; }).length <= 2;
    var rows = el('div', 'vs');
    AREAS.forEach(function (a) {
      var v = mine[a[0]], c = crew && crew[a[0]];
      if (!v) return;
      var row = el('div', 'vrow' + (single && Number(v) === lo ? ' low' : ''));
      row.appendChild(el('span', null, a[1]));
      var t = el('div', 'vt'); var bar = el('i'); bar.style.width = (Number(v) / 5 * 100) + '%'; t.appendChild(bar);
      if (c !== null && c !== undefined) { var tick = el('b'); tick.style.left = (Number(c) / 5 * 100) + '%'; t.appendChild(tick); }
      row.appendChild(t);
      row.appendChild(el('em', null, v + (c !== null && c !== undefined ? ' · ' + Number(c).toFixed(1) : '')));
      rows.appendChild(row);
    });
    box.appendChild(rows);
    var leg = el('div', 'vleg'); var a1 = el('span'); a1.appendChild(el('i')); a1.appendChild(document.createTextNode('You'));
    var a2 = el('span'); a2.appendChild(el('b')); a2.appendChild(document.createTextNode('Crew average'));
    leg.appendChild(a1); leg.appendChild(a2); box.appendChild(leg);
    // His lowest area, named in words rather than by colour, so the colours only ever mean you and the crew.
    var names = single ? AREAS.filter(function (a) { return Number(mine[a[0]]) === lo; }).map(function (a) { return a[1]; }) : [];
    return names.length ? ' Your lowest: ' + names.join(' and ') + '.' : '';
  }
  // Right after he answers: his answers next to the crew's, once three or more are in.
  function crewNow(boxId, dinnerKey, week) {
    var box = $(boxId); box.textContent = ''; box.hidden = true;
    var call = ctx.mode === 'link' ? rpc('link_crew_now', { p_key: ctx.key, p_dinner: week ? null : dinnerKey })
      : rpc('table_crew_now', { p_dinner: ctx.dinner.key, p_code: ctx.code, p_person: ctx.person });
    return call.then(function (r) {
      if (!r) return;
      box.hidden = false;
      box.appendChild(el('span', 'label', week ? 'Your week next to the crew\'s' : 'You next to the crew tonight'));
      if (!r.averages) {
        var n = r.count;
        box.appendChild(el('p', 'body', (week ? (n === 1 ? 'You\'re the first to answer this week.' : n + ' of you have answered this week.') : (n === 1 ? 'You\'re the first one in.' : n + ' of you are in so far.')) +
          (week ? ' The crew\'s week shows once three of you answer.' : ' The crew\'s average shows once three of you are in.')));
        return;
      }
      var low = vsRows(box, st.scores, r.averages);
      var mine = average(), crew = avgOf(r.averages);
      box.appendChild(el('p', 'small', 'You ' + (mine === null ? '' : mine.toFixed(1)) + ', the crew ' + (crew === null ? '' : crew.toFixed(1)) + ', from ' + r.count + ' ' + (week ? 'answers' : 'men') + '.' + low));
    }, function () { box.hidden = true; });
  }

  // ---- sliders: a tap picks the value under the finger, a sideways drag slides, a vertical swipe scrolls ----
  var sliderEls = {};
  function knobAt(v) { return 'calc(11px + (100% - 22px) * ' + ((v - 1) / 4) + ')'; }
  function renderSlider(k) {
    var s = sliderEls[k]; var v = st.scores[k];
    s.track.classList.toggle('unset', !v);
    s.knob.style.left = knobAt(v || 3);
    s.out.textContent = v || '·';
    s.track.setAttribute('aria-valuenow', String(v || 3));
    s.track.setAttribute('aria-valuetext', v ? v + ' of 5' : 'Not set yet');
  }
  function setScore(k, v) {
    if (st.scores[k] !== v) { st.scores[k] = v; save(); renderSlider(k); }
    refreshWheelScreen(k);
  }
  function valueAt(track, x) {
    var r = track.getBoundingClientRect();
    var t = (x - r.left - 11) / Math.max(1, r.width - 22);
    return Math.max(1, Math.min(5, Math.round(t * 4) + 1));
  }
  AREAS.forEach(function (a) {
    var k = a[0];
    var row = document.createElement('div'); row.className = 'srow';
    var lab = document.createElement('span'); lab.className = 'slab'; lab.id = 'l-' + k; lab.textContent = a[1];
    var track = document.createElement('div'); track.className = 'track'; track.id = 'r-' + k; track.tabIndex = 0;
    track.setAttribute('role', 'slider'); track.setAttribute('aria-labelledby', 'l-' + k);
    track.setAttribute('aria-valuemin', '1'); track.setAttribute('aria-valuemax', '5');
    var rail = document.createElement('i'); rail.className = 'rail'; track.appendChild(rail);
    for (var t = 1; t <= 5; t++) { var tick = document.createElement('i'); tick.className = 'tick'; tick.style.left = knobAt(t); track.appendChild(tick); }
    var knob = document.createElement('b'); knob.className = 'knob'; track.appendChild(knob);
    var out = document.createElement('output'); out.setAttribute('aria-hidden', 'true');
    row.appendChild(lab); row.appendChild(track); row.appendChild(out);
    $('sliders').appendChild(row);
    sliderEls[k] = { track: track, knob: knob, label: lab, out: out };
    renderSlider(k);
    var g = null;
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: e.pointerType === 'mouse' ? 'drag' : 'wait' };
      if (g.mode === 'drag') { try { track.setPointerCapture(e.pointerId); } catch (err) {} setScore(k, valueAt(track, e.clientX)); }
    });
    track.addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      if (g.mode === 'wait') {
        var dx = Math.abs(e.clientX - g.x), dy = Math.abs(e.clientY - g.y);
        if (dy > 8 && dy > dx) { g.mode = 'scroll'; return; }
        if (dx > 8) { g.mode = 'drag'; try { track.setPointerCapture(e.pointerId); } catch (err) {} }
      }
      if (g.mode === 'drag') setScore(k, valueAt(track, e.clientX));
    });
    track.addEventListener('pointerup', function (e) {
      if (!g || e.pointerId !== g.id) return;
      if (g.mode === 'wait') setScore(k, valueAt(track, e.clientX));
      g = null;
    });
    track.addEventListener('pointercancel', function () { g = null; });
    track.addEventListener('keydown', function (e) {
      var v = st.scores[k], nv = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nv = v ? Math.min(5, v + 1) : 4;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nv = v ? Math.max(1, v - 1) : 2;
      else if (e.key === 'Home') nv = 1;
      else if (e.key === 'End') nv = 5;
      else if (e.key === 'Enter' || e.key === ' ') nv = v || 3;
      else if (/^[1-5]$/.test(e.key)) nv = parseInt(e.key, 10);
      if (nv === null) return;
      e.preventDefault(); setScore(k, nv);
    });
  });
  function renderAllSliders() { AREAS.forEach(function (a) { renderSlider(a[0]); }); }
  var idle = null;
  function refreshWheelScreen(active) {
    clearTimeout(idle);
    if (active) idle = setTimeout(function () { refreshWheelScreen(null); }, 900);
    paint(active);
    var low = lowest();
    AREAS.forEach(function (a) {
      sliderEls[a[0]].label.classList.toggle('low', !!(low && low.key === a[0]));
      sliderEls[a[0]].label.classList.toggle('active', active === a[0]);
    });
    var left = AREAS.length - setCount();
    var line = $('lowestLine');
    line.textContent = !low ? 'Tap or slide each one' : (left > 0 ? 'Lowest so far · ' : (ctx.pulse ? 'Lowest this week · ' : 'Lowest tonight · ')) + low.label + ' ' + low.v;
    line.classList.toggle('none', !low);
    var btn = $('toProblem');
    btn.disabled = left > 0;
    btn.textContent = left > 0 ? left + ' to go' : (ctx.pulse ? 'Send' : 'Next');
  }
  function openWheel() {
    $('wheelStep').textContent = ctx.pulse ? 'This week' : 'Arriving · 1 of 2';
    $('wheelBars').hidden = !!ctx.pulse;
    $('h-wheel').textContent = ctx.pulse ? 'How\'s the week?' : 'How are you arriving?';
    $('wheelBody').textContent = ctx.pulse ? 'Slide each to how this week felt. 1 is rough, 5 is strong.' : 'Slide each to how it feels tonight. 1 is rough, 5 is strong.';
    bigW.label.textContent = ctx.pulse ? 'This week' : 'Tonight';
    $('wheelStatus').textContent = '';
    renderAllSliders(); refreshWheelScreen(null); show('wheel');
  }
  $('toProblem').addEventListener('click', function () {
    if (setCount() < AREAS.length) return;
    if (ctx.pulse) { sendPulse(); return; }
    paint(null); buildChips(); show('problem');
  });

  // ---- problem screen ----
  var problemEl = $('problem');
  problemEl.addEventListener('input', function () { st.problem = problemEl.value; save(); checkArrive(); });
  function buildChips() {
    var low = lowest();
    if (!st.area && low) st.area = low.key;
    $('areaHint').textContent = low ? 'Your lowest tonight is ' + low.label + '. Is it there?' : '';
    var box = $('areaChips'); box.textContent = '';
    AREAS.forEach(function (a) {
      var c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = a[1];
      c.setAttribute('aria-pressed', String(st.area === a[0]));
      c.addEventListener('click', function () { st.area = a[0]; save(); buildChips(); });
      box.appendChild(c);
    });
    checkArrive();
  }
  function checkArrive() { $('sendArrive').disabled = !(st.problem.trim() && st.area && setCount() === AREAS.length); }
  $('sendArrive').addEventListener('click', function () {
    if ($('sendArrive').disabled) return;
    st.arrive = { status: 'sending' }; save();
    $('sendArrive').disabled = true; $('arriveStatus').textContent = 'Sending…';
    sendStage('arrive').then(function () { openArrived(); });
  });

  // ---- sending ----
  function payload(stage) {
    if (stage === 'arrive') return { scores: st.scores, problem: st.problem.trim(), area: st.area };
    return { commitment: st.commitment.trim(), by_when: st.by_when, offer: st.offer.trim(), share: st.share };
  }
  var seq = { arrive: 0, close: 0 };
  function sendStage(stage) {
    var mine = ++seq[stage];
    var call = ctx.mode === 'link'
      ? rpc('link_checkin', { p_key: ctx.key, p_dinner: ctx.dinner.key, p_stage: stage, p: payload(stage) })
      : rpc('table_checkin', { p_dinner: ctx.dinner.key, p_code: ctx.code, p_person: ctx.person, p_stage: stage, p: payload(stage) });
    return call.then(function () { return 'sent'; }, function (e) { return e.refused ? 'refused:' + e.message : 'pending'; })
      .then(function (result) {
        if (mine !== seq[stage]) return result;
        st[stage] = { status: result };
        if (stage === 'close' && result === 'sent') forget(); else save();
        return result;
      });
  }
  function describe(stage) {
    var s = st[stage]; if (!s) return '';
    if (s.status === 'sent') return 'Sent.';
    if (s.status === 'pending') return 'Not sent yet: no connection. Try again when you have signal.';
    if (s.status === 'sending') return 'Sending…';
    if (s.status.indexOf('refused:') === 0) return 'It didn\'t go through (' + s.status.slice(8) + '). Show your anchor this screen.';
    return '';
  }
  function retryable(stage) { var s = st[stage]; return !!(s && (s.status === 'pending' || s.status.indexOf('refused:') === 0)); }

  // ---- arrived ----
  function arrivedStatus() {
    var msg = describe('arrive');
    $('arrivedStatus').textContent = msg;
    $('arrivedStatus').classList.toggle('warn', retryable('arrive'));
    $('retryArrive').hidden = !retryable('arrive');
    return msg;
  }
  function openArrived() {
    paint(null);
    var a = average(); var low = lowest();
    $('arrivedAvg').textContent = a === null ? '' : a.toFixed(1);
    $('arrivedLow').textContent = low ? 'Lowest: ' + low.label : '';
    $('arrivedHow').textContent = ctx.mode === 'link'
      ? 'At the close, open your link again. It picks up where you left off.'
      : 'At the close, scan the same code again on this phone. It picks up where you left off.';
    var msg = arrivedStatus();
    show('arrived'); bloom(arrivedW); say(msg);
    if (st.arrive && st.arrive.status === 'sent') crewNow('arrivedVs', ctx.dinner.key, false);
  }
  $('retryArrive').addEventListener('click', function () {
    $('arrivedStatus').textContent = 'Sending…'; $('retryArrive').hidden = true;
    sendStage('arrive').then(function () { say(arrivedStatus()); if (st.arrive.status === 'sent') crewNow('arrivedVs', ctx.dinner.key, false); });
  });
  $('toClose').addEventListener('click', openClose);

  // ---- close ----
  var commitEl = $('commitment'); var offerEl = $('offer');
  commitEl.addEventListener('input', function () { st.commitment = commitEl.value; save(); checkClose(); });
  offerEl.addEventListener('input', function () { st.offer = offerEl.value; save(); });
  function buildPicker(boxId, items, current, onPick) {
    var box = $(boxId); box.textContent = '';
    items.forEach(function (it) {
      var c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = it[1];
      c.setAttribute('aria-pressed', String(current === it[0]));
      c.addEventListener('click', function () { onPick(it[0]); });
      box.appendChild(c);
    });
  }
  function shares() {
    var an = ctx.anchor, cl = ctx.cityLead;
    return [
      ['none', 'Nobody else. Averages only.'],
      ['anchor', an ? an + ', my anchor' : 'My anchor'],
      ['city', an && cl ? an + ' and ' + cl + ' at Actualize' : 'My anchor and Actualize']
    ];
  }
  function drawClosePickers() {
    var whens = ['This week', 'Within two weeks', 'Before ' + nextDinnerName()].map(function (w) { return [w, w]; });
    buildPicker('whenChips', whens, st.by_when, function (v) { st.by_when = v; save(); drawClosePickers(); });
    buildPicker('shareChips', shares(), st.share, function (v) { st.share = v; save(); drawClosePickers(); });
    checkClose();
  }
  function checkClose() { $('sendClose').disabled = !(st.commitment.trim() && st.by_when && st.share); }
  function openClose() {
    paint(null);
    $('closeName').textContent = ctx.first ? ', ' + ctx.first : '';
    var hasRecap = !!(st.problem && st.problem.trim());
    $('recap').hidden = !hasRecap;
    if (hasRecap) {
      var a = average();
      $('recapLabel').textContent = a === null ? 'You brought' : 'You arrived at ' + a.toFixed(1) + ' and brought';
      $('recapProblem').textContent = st.problem.trim();
      $('recapArea').textContent = labelOf(st.area);
    }
    $('commitLabel').textContent = 'What will you do about it before ' + nextDinnerName() + '?';
    $('shareNote').textContent = (ctx.anchor || 'Your anchor') + ' sees that you came and your commitment, so he can follow up. Your crew only sees averages. Nobody else is a fine answer.';
    $('editArrival').hidden = !hasRecap && !setCount();
    commitEl.value = st.commitment; offerEl.value = st.offer;
    drawClosePickers();
    $('closeStatus').textContent = retryable('arrive') ? 'Your arrival answers haven\'t gone through yet. Locking in sends them too.' : '';
    show('close'); if (hasRecap) bloom(closeW);
  }
  $('editArrival').addEventListener('click', function () { openWheel(); });
  $('sendClose').addEventListener('click', function () {
    if ($('sendClose').disabled) return;
    $('sendClose').disabled = true; $('closeStatus').textContent = 'Sending…';
    st.close = { status: 'sending' }; save();
    var first = retryable('arrive') ? sendStage('arrive') : Promise.resolve('sent');
    first.then(function () { return sendStage('close'); }).then(openDone);
  });

  // ---- done ----
  function doneStatus() {
    var msg = describe('close');
    $('doneStatus').textContent = msg;
    $('doneStatus').classList.toggle('warn', retryable('close'));
    $('retryClose').hidden = !retryable('close');
    return msg;
  }
  function openDone() {
    paint(null);
    $('doneCommit').textContent = st.commitment.trim();
    $('doneWhen').textContent = st.by_when;
    $('doneNext').textContent = 'A crew mate asks you about it at ' + nextDinnerName() + '.';
    var a = average(); var low = lowest();
    $('doneAvg').textContent = a === null ? '' : a.toFixed(1);
    $('doneLow').textContent = low ? 'Lowest: ' + low.label : '';
    var paired = ctx.mode === 'link' && ctx.phone === 'this';
    $('doneHome').hidden = !paired;
    $('doneFoot').textContent = paired ? 'Your answers are kept in your space, on this phone only.' : 'Nothing you sent stays on this phone once it\'s in.';
    var msg = doneStatus();
    show('done'); bloom(doneW); say(msg);
    if (st.close && st.close.status === 'sent') crewNow('doneVs', ctx.dinner.key, false);
  }
  $('retryClose').addEventListener('click', function () {
    $('doneStatus').textContent = 'Sending…'; $('retryClose').hidden = true;
    var first = retryable('arrive') ? sendStage('arrive') : Promise.resolve('sent');
    first.then(function () { return sendStage('close'); }).then(function () { say(doneStatus()); if (st.close.status === 'sent') crewNow('doneVs', ctx.dinner.key, false); });
  });
  $('doneHome').addEventListener('click', function () { openHome(true); });
  $('noteHome').addEventListener('click', function () { openHome(true); });
  $('noteRemember').addEventListener('click', function () { store('ac-notmine', null); openHello(); });
  window.addEventListener('online', function () {
    if (retryable('arrive')) sendStage('arrive').then(arrivedStatus);
    if (st.close && retryable('close')) sendStage('close').then(doneStatus);
  });

  // ---- welcome ----
  function openWelcome() {
    $('welcomeKicker').textContent = 'Actualize · ' + (ctx.crew || 'Your crew');
    $('dinnerMeta').textContent = 'Dinner ' + ctx.dinner.n + ' · ' + when(ctx.dinner.starts_at, ctx.tz);
    $('welcomeLede').textContent = (ctx.first ? 'Hi ' + ctx.first + '. ' : '') + 'Two moments tonight.';
    $('welcomeAnchor').textContent = ctx.anchor ? ctx.anchor + ', your anchor' : 'Your anchor';
    $('whoBox').hidden = ctx.mode !== 'table';
    $('notMe').hidden = !ctx.recognised;
    $('notMe').textContent = ctx.recognised ? 'Not ' + ctx.first + '? Pick your name' : '';
    $('welcomeFoot').textContent = ctx.mode === 'link'
      ? (ctx.recognised ? 'This phone knows you, so there\'s no list to pick from.' : 'This is your own link. Anyone with it could answer as you, so keep it to yourself.')
      : 'Pick your own name. Your answers are sent privately.';
    if (ctx.mode === 'table') drawNames();
    $('toWheel').disabled = ctx.mode === 'table' && !ctx.person;
    show('welcome');
  }
  function drawNames() {
    var box = $('names'); box.textContent = '';
    ctx.men.forEach(function (m) {
      var c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = m.first_name;
      c.setAttribute('aria-pressed', String(ctx.person === m.id));
      c.addEventListener('click', function () {
        ctx.person = m.id; ctx.first = m.first_name;
        st = load(); problemEl.value = st.problem;
        drawNames(); $('toWheel').disabled = false;
      });
      box.appendChild(c);
    });
  }
  $('toWheel').addEventListener('click', function () {
    if (ctx.mode === 'table' && !ctx.person) return;
    if (st.close && st.close.status === 'sent') { openDone(); return; }
    if (st.arrive && !retryable('arrive')) { openClose(); return; }
    openWheel();
  });
  $('notMe').addEventListener('click', function () {
    ctx.recognised = false; ctx.mode = 'table'; ctx.key = null; ctx.person = null; ctx.first = null; ctx.code = ctx.tableCode;
    openTable();
  });

  // ---- between dinners: kept, and the weekly check-in ----
  function openKept(thenGo) {
    var n = ctx.keptAsk.n;
    $('keptKicker').textContent = 'Since dinner ' + n;
    $('keptBody').textContent = 'The commitment you made at dinner ' + n + '. Only your answer is sent.';
    $('keptStatus').textContent = '';
    var answer = function (kept) {
      $('keptStatus').textContent = 'Sending…';
      rpc('link_kept', { p_key: ctx.key, p_dinner: ctx.keptAsk.key, p_kept: kept }).then(function () {
        ctx.keptAsk = null;
        note('Since dinner ' + n, kept ? 'Kept. Good.' : 'Noted.', kept ? '' : 'There\'s still time. Your crew will ask.', '', thenGo);
      }, function (e) { $('keptStatus').textContent = e.refused ? 'That didn\'t go through: ' + e.message : 'No connection. Try again when you have signal.'; });
    };
    $('keptYes').onclick = function () { answer(true); };
    $('keptNo').onclick = function () { answer(false); };
    show('kept');
  }
  function openPulse() { show('pulse'); }
  function startPulse() { ctx.pulse = true; st = blank(); problemEl.value = ''; openWheel(); }
  $('toPulse').addEventListener('click', startPulse);
  function sendPulse() {
    $('toProblem').disabled = true; $('wheelStatus').textContent = 'Sending…';
    rpc('link_pulse', { p_key: ctx.key, p_scores: st.scores }).then(function () {
      ctx.pulseDone = true;
      note('This week', 'Sent. See you next week.', nextLine(), '');
      crewNow('noteVs', null, true);
    }, function (e) {
      $('toProblem').disabled = false;
      $('wheelStatus').textContent = e.refused ? 'That didn\'t go through: ' + e.message : 'No connection. Try again when you have signal.';
    });
  }
  function nextLine() {
    var nd = ctx.next;
    return nd && nd.starts_at ? 'Next: dinner ' + nd.n + ', ' + when(nd.starts_at, ctx.tz) + '.' : 'Your anchor will share the next date.';
  }
  function betweenDinners() {
    if (ctx.keptAsk) { openKept(betweenDinners); return; }
    if (!ctx.pulseDone) { openPulse(); return; }
    note('Actualize · ' + (ctx.crew || ''), 'Nothing to answer right now.', nextLine(), ctx.phone === 'other' ? '' : 'Keep your link to yourself.');
  }

  // ---- his space ----
  function nextDinner(ds) {
    var now = Date.now();
    return ds.filter(function (d) { return d.open || (d.starts_at && new Date(d.starts_at).getTime() > now); })
      .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); })[0]
      || ds.filter(function (d) { return !d.starts_at; }).sort(function (a, b) { return a.n - b.n; })[0] || null;
  }
  function ics(d) {
    var stamp = function (t) { return new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var esc = function (s) { return String(s).replace(/[\\,;]/g, function (c) { return '\\' + c; }); };
    var text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Actualize//Crews//EN', 'BEGIN:VEVENT', 'UID:' + d.key + '@actualize-crews',
      'DTSTAMP:' + stamp(Date.now()), 'DTSTART:' + stamp(d.starts_at), 'DTEND:' + stamp(d.ends_at),
      'SUMMARY:' + esc('Breaking Bread · Dinner ' + d.n + ' · ' + d.job),
      'DESCRIPTION:' + esc((d.host ? d.host + ' hosts. ' : '') + 'The address is in the crew chat. Check in with your link.'),
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
    var a = document.createElement('a'); a.href = url; a.download = 'breaking-bread-dinner-' + d.n + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
  function renderHome() {
    var sp = ctx.space, o = ctx.open;
    ctx.pulse = false;
    $('homeKicker').textContent = 'Actualize · ' + (sp.crew || '');
    $('h-home').textContent = sp.first_name;
    // the one thing to do now
    var now = $('homeNow'); now.textContent = ''; now.className = 'now';
    var act = function (text, sub, label, go) {
      now.appendChild(el('p', null, text)); if (sub) now.appendChild(el('p', 'small', sub));
      if (label) { var b = el('button', 'go', label); b.type = 'button'; b.id = 'homeGo'; b.addEventListener('click', go); now.appendChild(b); }
    };
    if (o.dinner && !o.dinner.closed) {
      ctx.dinner = o.dinner; st = load(); problemEl.value = st.problem;
      if (o.dinner.arrived) act('Dinner ' + o.dinner.n + ' is on. Time for the close.', 'Your commitment, and who else sees your answers.', 'Do the close', openClose);
      else act('Dinner ' + o.dinner.n + ' is on.', 'Check in when you sit down. A minute now, a minute at the close.', 'Check in', openWelcome);
    } else if (ctx.keptAsk) {
      act('Did you keep your commitment from dinner ' + ctx.keptAsk.n + '?', null, 'Answer', function () { openKept(function () { openHome(true); }); });
    } else if (!ctx.pulseDone) {
      act('How\'s the week?', 'Nine sliders, a minute. You\'ll see the crew\'s week next to yours.', 'Begin', startPulse);
    } else {
      now.className = 'now calm';
      act(o.dinner && o.dinner.closed ? 'You\'re done for tonight.' : 'Nothing to answer right now.', 'The weekly check-in opens again on Monday.');
    }
    // the next dinner
    var nd = nextDinner(sp.dinners || []), nx = $('homeNext'); nx.textContent = ''; nx.hidden = !nd;
    if (nd) {
      nx.appendChild(el('span', 'label', nd.open ? 'Tonight' : 'Next dinner'));
      nx.appendChild(el('h3', null, 'Dinner ' + nd.n + ' · ' + nd.job));
      nx.appendChild(el('p', 'body', nd.starts_at ? when(nd.starts_at, ctx.tz) + ', ' + timeOf(nd.starts_at) + (nd.host ? ' · ' + nd.host + ' hosts' : '') : 'Date to come' + (nd.host ? ' · ' + nd.host + ' hosts' : '')));
      if (nd.starts_at && !nd.open) { var cb = el('button', 'cal', 'Add to calendar'); cb.type = 'button'; cb.addEventListener('click', function () { ics(nd); }); nx.appendChild(cb); }
    }
    // him next to the crew, at his latest dinner
    var mine = sp.mine || { checkins: [], weeks: [] }, pic = sp.crew_picture || { dinners: [], weeks: [] };
    var vs = $('homeVs'); vs.textContent = '';
    var last = mine.checkins.filter(function (c) { return c.arrived && Object.keys(c.scores || {}).length; }).pop();
    if (!last) {
      vs.appendChild(el('span', 'label', 'You next to the crew'));
      vs.appendChild(el('p', 'body', 'After your first check-in, your wheel shows here next to the crew\'s average.'));
    } else {
      var cd = pic.dinners.filter(function (x) { return x.dinner === last.dinner; })[0] || {};
      vs.appendChild(el('span', 'label', 'Dinner ' + last.n + ': you next to the crew'));
      var low = vsRows(vs, last.scores, cd.averages);
      var ma = avgOf(last.scores), ca = avgOf(cd.averages);
      vs.appendChild(el('p', 'small', (cd.averages ? 'You ' + ma.toFixed(1) + ', the crew ' + ca.toFixed(1) + '.' : 'The crew\'s average shows once three of you have checked in.') + low));
    }
    // his weeks
    var wk = $('homeWeeks'); wk.textContent = ''; wk.hidden = !mine.weeks.length;
    if (mine.weeks.length) {
      wk.appendChild(el('span', 'label', 'Your weeks'));
      var crewWeek = {}; pic.weeks.forEach(function (w) { if (w.averages) crewWeek[w.week] = avgOf(w.averages); });
      var rows = el('div', 'vs');
      mine.weeks.slice(-8).forEach(function (w) {
        var v = avgOf(w.scores), c = crewWeek[w.week];
        var row = el('div', 'vrow'); row.appendChild(el('span', null, shortDay(w.week + 'T12:00:00Z')));
        var t = el('div', 'vt'); var bar = el('i'); bar.style.width = (v / 5 * 100) + '%'; t.appendChild(bar);
        if (c !== undefined) { var tick = el('b'); tick.style.left = (c / 5 * 100) + '%'; t.appendChild(tick); }
        row.appendChild(t); row.appendChild(el('em', null, v.toFixed(1) + (c !== undefined ? ' · ' + c.toFixed(1) : '')));
        rows.appendChild(row);
      });
      wk.appendChild(rows);
    }
    // his commitments
    var cm = $('homeCommit'); cm.textContent = '';
    var commits = mine.checkins.filter(function (c) { return c.commitment; });
    cm.hidden = !commits.length;
    if (commits.length) {
      cm.appendChild(el('span', 'label', 'Your commitments'));
      var list = el('div', 'list');
      commits.slice().reverse().forEach(function (c) {
        var row = el('div'); row.appendChild(el('b', null, 'Dinner ' + c.n));
        var right = el('span', null, c.commitment);
        right.appendChild(el('small', null, (c.by_when || '') + (c.kept === true ? ' · kept' : c.kept === false ? ' · not yet' : '')));
        row.appendChild(right); list.appendChild(row);
      });
      cm.appendChild(list);
    }
    // keep it on the home screen
    var hint = $('homeInstall'); hint.textContent = ''; hint.hidden = standalone();
    if (!hint.hidden) {
      var ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      hint.appendChild(el('b', null, 'Keep it on your home screen. '));
      hint.appendChild(document.createTextNode(ios ? 'Tap the Share button, then Add to Home Screen. It opens straight to your space.' : 'Open the browser menu, then Add to Home screen. It opens straight to your space.'));
    }
    show('home');
  }
  function openHome(fresh) {
    if (!fresh && ctx.space) { renderHome(); return; }
    Promise.all([rpc('link_open', { p_key: ctx.key }), rpc('link_space', { p_key: ctx.key, p_device: ctx.device })]).then(function (r) {
      if (!r[0] || !r[1]) { note('Actualize', 'This link isn\'t active.', 'Ask your anchor for a new one.'); return; }
      applyOpen(r[0]); ctx.space = r[1]; ctx.phone = r[1].phone;
      if (ctx.phone !== 'this') { route(); return; }
      renderHome();
    }, function (e) { note('Actualize', 'Can\'t open right now.', e.refused ? e.message : 'No connection. Try again when you have signal.'); });
  }

  // ---- first time on a phone ----
  function openHello() {
    $('helloKicker').textContent = 'Actualize · ' + (ctx.crew || 'Your crew');
    $('h-hello').textContent = 'Hi ' + ctx.first;
    $('helloAnchor').textContent = ctx.anchor ? ctx.anchor + ', your anchor' : 'Your anchor';
    $('helloStatus').textContent = '';
    show('hello');
  }
  $('helloYes').addEventListener('click', function () {
    var secret = newSecret();
    $('helloYes').disabled = true; $('helloStatus').textContent = 'Setting up…';
    rpc('link_pair', { p_key: ctx.key, p_device: secret }).then(function (r) {
      $('helloYes').disabled = false;
      if (r && r.paired) { ctx.device = secret; ctx.phone = 'this'; remember(); ctx.space = null; afterHello(); return; }
      ctx.phone = 'other'; route();
    }, function (e) { $('helloYes').disabled = false; $('helloStatus').textContent = e.refused ? 'That didn\'t go through: ' + e.message : 'No connection. Try again when you have signal.'; });
  });
  $('helloNo').addEventListener('click', function () { store('ac-notmine', ctx.key); ctx.phone = 'none'; route(); });
  function afterHello() {
    if (ctx.open.dinner && !ctx.open.dinner.closed) { route(); return; }
    openHome(true);
  }

  // ---- start ----
  function applyOpen(o) {
    ctx.open = o;
    ctx.first = o.first_name; ctx.crew = o.crew; ctx.tz = o.tz; ctx.anchor = o.anchor; ctx.cityLead = o.city_lead;
    ctx.next = o.next_dinner; ctx.keptAsk = o.kept_ask; ctx.pulseDone = o.pulse_done;
  }
  // Where a link goes: tonight's dinner when one is open, otherwise his space on his phone, or the next thing to answer.
  function route() {
    var o = ctx.open;
    if (!o.dinner) { if (ctx.phone === 'this') openHome(false); else betweenDinners(); return; }
    ctx.dinner = o.dinner;
    st = load(); problemEl.value = st.problem;
    var go = function () {
      if (o.dinner.closed && !(st.close && st.close.status !== 'sent')) {
        if (ctx.phone === 'this') { openHome(true); return; }
        note('Dinner ' + o.dinner.n, 'You\'re done for tonight.', 'Your answers are in. This page doesn\'t show them back here.', '');
        return;
      }
      if (o.dinner.arrived && !st.arrive) st.arrive = { status: 'sent' };
      if (st.close && retryable('close')) { openDone(); return; }
      if (st.arrive) { if (st.arrive.status === 'sent' || retryable('arrive')) { openClose(); return; } }
      openWelcome();
    };
    if (ctx.keptAsk) openKept(go); else go();
  }
  function startLink() {
    ctx.device = phoneSecret();
    Promise.all([rpc('link_open', { p_key: ctx.key }), rpc('link_space', { p_key: ctx.key, p_device: ctx.device })]).then(function (r) {
      var o = r[0], sp = r[1];
      if (!o) {
        var me = stored('ac-me'); if (me && me.key === ctx.key) store('ac-me', null);
        note('Actualize', 'This link isn\'t active.', 'Ask your anchor for a new one.'); return;
      }
      applyOpen(o); ctx.space = sp; ctx.phone = sp ? sp.phone : 'none';
      if (ctx.phone === 'this') { remember(); route(); return; }
      if (ctx.phone === 'none' && stored('ac-notmine') !== ctx.key) { openHello(); return; }
      route();
    }, function (e) {
      note('Actualize', 'Can\'t open right now.', e.refused ? e.message : 'No connection. Try again when you have signal.');
    });
  }
  function openTable() {
    rpc('table_open', { p_dinner: ctx.dinnerKey, p_code: ctx.code }).then(function (o) {
      if (!o) { note('Actualize', 'Check-in isn\'t open.', 'It opens three hours before the dinner and closes a day after. If that doesn\'t sound right, ask your anchor.'); return; }
      ctx.dinner = o.dinner; ctx.crew = o.crew; ctx.men = o.men; ctx.tz = o.tz; ctx.anchor = o.anchor; ctx.cityLead = o.city_lead;
      openWelcome();
    }, function (e) {
      note('Actualize', 'Can\'t open right now.', e.refused ? e.message : 'No connection. Try again when you have signal.');
    });
  }
  // At the table, a phone that knows him goes straight to his own check-in.
  function startTable() {
    ctx.tableCode = ctx.code;
    var me = stored('ac-me');
    if (!me || !me.key) { openTable(); return; }
    rpc('link_open', { p_key: me.key }).then(function (o) {
      if (!o || !o.dinner || o.dinner.key !== ctx.dinnerKey) { openTable(); return; }
      ctx.mode = 'link'; ctx.key = me.key; ctx.device = me.device; ctx.recognised = true; ctx.phone = 'this';
      applyOpen(o); route();
    }, openTable);
  }

  var bigW = buildWheel($('bigWheel'));
  var arrivedW = buildWheel($('arrivedWheel'), 0.5);
  var closeW = buildWheel($('closeWheel'), 0.4);
  var doneW = buildWheel($('doneWheel'), 0.5);
  wheels.push(bigW, arrivedW, closeW, doneW);

  if (!CFG.url || !CFG.key || /YOUR/.test(CFG.url + CFG.key)) { note('Actualize', 'Not set up yet.', 'This page hasn\'t been connected to its database.'); return; }
  if (ctx.mode === 'link') startLink();
  else if (ctx.mode === 'table') startTable();
  else note('Actualize', 'This page needs your link.', 'Open the private link your anchor sent you, or scan the code on the table.');
})();
