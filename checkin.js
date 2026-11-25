// Breaking Bread check-in for Actualize crews. Men never sign in.
//   #k=<key>          his own private link: answers for tonight, the kept question, the weekly check-in
//   #t=<dinner>.<code> the table QR code: he picks his name, then answers
// Both only send answers. Nothing he has sent is ever read back from the database.
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

  // ---- where we are ----
  var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  var ctx = { mode: null };
  if (hash.get('k')) { ctx.mode = 'link'; ctx.key = hash.get('k'); }
  else if (hash.get('t')) { var tp = hash.get('t').split('.'); ctx.mode = 'table'; ctx.dinnerKey = tp[0]; ctx.code = tp[1] || ''; }

  function when(iso, tz) {
    if (!iso) return '';
    try { return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz || undefined }).format(new Date(iso)).replace(',', ''); }
    catch (e) { return new Date(iso).toDateString(); }
  }
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
    $('noteFoot').textContent = foot || '';
    $('noteNext').hidden = !next; $('noteNext').onclick = next || null;
    show('note');
  }

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
  }
  $('retryArrive').addEventListener('click', function () {
    $('arrivedStatus').textContent = 'Sending…'; $('retryArrive').hidden = true;
    sendStage('arrive').then(function () { say(arrivedStatus()); });
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
      ['none', 'Nobody. Totals only.'],
      ['anchor', an ? an + ', my anchor' : 'My anchor'],
      ['city', an && cl ? an + ' and ' + cl + ', the city lead' : 'My anchor and the city lead']
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
    var msg = doneStatus();
    show('done'); bloom(doneW); say(msg);
  }
  $('retryClose').addEventListener('click', function () {
    $('doneStatus').textContent = 'Sending…'; $('retryClose').hidden = true;
    var first = retryable('arrive') ? sendStage('arrive') : Promise.resolve('sent');
    first.then(function () { return sendStage('close'); }).then(function () { say(doneStatus()); });
  });
  window.addEventListener('online', function () {
    if (retryable('arrive')) sendStage('arrive').then(arrivedStatus);
    if (st.close && retryable('close')) sendStage('close').then(doneStatus);
  });

  // ---- welcome ----
  function openWelcome() {
    $('welcomeKicker').textContent = 'Actualize · ' + (ctx.crew || 'Your crew');
    $('dinnerMeta').textContent = 'Dinner ' + ctx.dinner.n + ' · ' + when(ctx.dinner.starts_at, ctx.tz);
    $('welcomeLede').textContent = (ctx.first ? 'Hi ' + ctx.first + '. ' : '') + 'Two moments tonight.';
    $('whoBox').hidden = ctx.mode !== 'table';
    $('welcomeFoot').textContent = ctx.mode === 'link'
      ? 'This is your own link. Anyone with it could answer as you, so keep it to yourself.'
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
  $('toPulse').addEventListener('click', function () { ctx.pulse = true; st = blank(); problemEl.value = ''; openWheel(); });
  function sendPulse() {
    $('toProblem').disabled = true; $('wheelStatus').textContent = 'Sending…';
    rpc('link_pulse', { p_key: ctx.key, p_scores: st.scores }).then(function () {
      ctx.pulseDone = true;
      note('This week', 'Sent. See you next week.', nextLine(), '');
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
    note('Actualize · ' + (ctx.crew || ''), 'Nothing to answer right now.', nextLine(), 'This link only ever sends answers. Keep it to yourself.');
  }

  // ---- start ----
  var bigW = buildWheel($('bigWheel'));
  var arrivedW = buildWheel($('arrivedWheel'), 0.5);
  var closeW = buildWheel($('closeWheel'), 0.4);
  var doneW = buildWheel($('doneWheel'), 0.5);
  wheels.push(bigW, arrivedW, closeW, doneW);

  if (!CFG.url || !CFG.key || /YOUR/.test(CFG.url + CFG.key)) { note('Actualize', 'Not set up yet.', 'This page hasn\'t been connected to its database.'); return; }
  if (ctx.mode === 'link') {
    rpc('link_open', { p_key: ctx.key }).then(function (o) {
      if (!o) { note('Actualize', 'This link isn\'t active.', 'Ask your anchor for a new one.'); return; }
      ctx.first = o.first_name; ctx.crew = o.crew; ctx.tz = o.tz; ctx.anchor = o.anchor; ctx.cityLead = o.city_lead;
      ctx.next = o.next_dinner; ctx.keptAsk = o.kept_ask; ctx.pulseDone = o.pulse_done;
      if (!o.dinner) { betweenDinners(); return; }
      ctx.dinner = o.dinner;
      st = load(); problemEl.value = st.problem;
      var go = function () {
        if (o.dinner.closed && !(st.close && st.close.status !== 'sent')) {
          note('Dinner ' + o.dinner.n, 'You\'re done for tonight.', 'Your answers are in. This page never shows them back.', '');
          return;
        }
        if (o.dinner.arrived && !st.arrive) st.arrive = { status: 'sent' };
        if (st.close && retryable('close')) { openDone(); return; }
        if (st.arrive) { if (st.arrive.status === 'sent' || retryable('arrive')) { openClose(); return; } }
        openWelcome();
      };
      if (ctx.keptAsk) openKept(go); else go();
    }, function (e) {
      note('Actualize', 'Can\'t open right now.', e.refused ? e.message : 'No connection. Try again when you have signal.');
    });
  } else if (ctx.mode === 'table') {
    rpc('table_open', { p_dinner: ctx.dinnerKey, p_code: ctx.code }).then(function (o) {
      if (!o) { note('Actualize', 'Check-in isn\'t open.', 'It opens three hours before the dinner and closes a day after. If that doesn\'t sound right, ask your anchor.'); return; }
      ctx.dinner = o.dinner; ctx.crew = o.crew; ctx.men = o.men; ctx.tz = o.tz; ctx.anchor = o.anchor; ctx.cityLead = o.city_lead;
      openWelcome();
    }, function (e) {
      note('Actualize', 'Can\'t open right now.', e.refused ? e.message : 'No connection. Try again when you have signal.');
    });
  } else {
    note('Actualize', 'This page needs your link.', 'Open the private link your anchor sent you, or scan the code on the table.');
  }
})();
