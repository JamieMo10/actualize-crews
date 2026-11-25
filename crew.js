// Actualize crews: sign-in and the spaces for anchors and Actualize.
// Every number and answer comes from database functions that check who is asking. Nothing here ranks a man.
(function () {
  'use strict';
  var CFG = window.CREWS_CONFIG || {};
  var AREAS = [['money', 'Money'], ['career', 'Career'], ['health', 'Health'], ['fun', 'Fun'], ['environment', 'Environment'],
    ['community', 'Community'], ['family', 'Family'], ['partner', 'Partner'], ['growth', 'Growth']];
  var NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
  var H3 = 3 * 3600e3, DAY = 24 * 3600e3;
  var $ = function (id) { return document.getElementById(id); };
  var areaName = function (k) { var f = AREAS.filter(function (a) { return a[0] === k; })[0]; return f ? f[1] : k; };
  var ROOT = new URL('./', location.href).href;
  var me = null, crew = null, sel = null, profile = null, pulse = [], people = [], reports = {}, sent = [], liveTimer = null, qrDinner = null, dateDinner = null, manOpen = null;

  // ---------- building blocks ----------
  var NS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    crew: '<circle cx="12" cy="12" r="2.6"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="20" r="2"/><path d="M6.6 7.3l3.4 3M17.4 7.3l-3.4 3M12 14.6v3.4"/>',
    dinner: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21"/>',
    pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.7M12 16.8v.2"/>',
    city: '<path d="M4 20V9l5-3v14M9 20V4l6 3v13M15 20v-9l5 2v7M3 20h18"/>',
    shared: '<path d="M4 5h16v11H9l-5 4z"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="1"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3-4.9"/>'
  };
  function icon(name) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];
    return s;
  }
  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  }
  function svg(tag, attrs) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function btn(label, iconName, onclick, cls, id) {
    return el('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button', id: id, onclick: onclick }, iconName ? icon(iconName) : null, label);
  }
  function clear(id) { var b = $(id); b.textContent = ''; return b; }
  function status(id, msg, warn) { $(id).textContent = msg || ''; $(id).classList.toggle('warn', !!warn); }
  function ini(name) { return String(name || '?').trim().charAt(0).toUpperCase(); }
  function joinNames(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function faces(people, label, hostId, max) {
    max = max || 6;
    var row = el('div');
    people.slice(0, max).forEach(function (p) { row.appendChild(el('i', { class: p.id === hostId ? 'h' : null, title: p.first_name, text: ini(p.first_name) })); });
    if (people.length > max) row.appendChild(el('i', { class: 'more', text: '+' + (people.length - max) }));
    return el('div', { class: 'faces' }, people.length ? row : null, label ? el('span', { text: label }) : null);
  }
  function copy(text, statusId, done) {
    var ok = function () { status(statusId, 'Copied.'); if (done) done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { status(statusId, 'Copy didn\'t work. Select the text and copy it.', true); });
    else status(statusId, 'Select the text and copy it.', true);
  }

  // ---------- dates, in the crew's own city ----------
  function tz() { return (me && me.tz) || 'America/Vancouver'; }
  function dayLabel(t) { return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz() }).format(new Date(t)).replace(',', ''); }
  function shortDay(t) { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz() }).format(new Date(t)); }
  function weekday(t) { return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: tz() }).format(new Date(t)); }
  function timeLabel(t) { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz() }).format(new Date(t)).toLowerCase().replace(/ /g, ' '); }
  function range(d) {
    if (!d.starts_at) return 'Date to come';
    var s = timeLabel(d.starts_at), e = timeLabel(d.ends_at);
    return dayLabel(d.starts_at) + ', ' + (s.slice(-2) === e.slice(-2) ? s.slice(0, -3) : s) + ' to ' + e;
  }
  function dayNum(t) { var p = new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / DAY; }
  function daysUntil(t) { return dayNum(t) - dayNum(Date.now()); }
  function localParts(iso) {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
    var g = function (t) { return parts.filter(function (p) { return p.type === t; })[0].value; };
    return { date: g('year') + '-' + g('month') + '-' + g('day'), time: g('hour') + ':' + g('minute') };
  }
  // A wall-clock time in the crew's city, as a moment in time.
  function zonedToUtc(date, time, zone) {
    var d = date.split('-').map(Number), t = time.split(':').map(Number);
    var want = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]), guess = want;
    for (var i = 0; i < 3; i++) {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
      var g = function (ty) { return Number(parts.filter(function (p) { return p.type === ty; })[0].value); };
      guess += want - Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
    }
    return new Date(guess).toISOString();
  }

  // ---------- views and tabs ----------
  var TABS = {
    anchor: [['home', 'Crew', 'crew'], ['dinners', 'Dinners', 'dinner'], ['weekly', 'Weekly', 'pulse'], ['help', 'Help', 'help']],
    city: [['cityhome', 'City', 'city'], ['cityshared', 'Shared', 'shared']]
  };
  function views(name) {
    ['loading', 'signin', 'nobody', 'anchor', 'city'].forEach(function (v) { $('v-' + v).hidden = v !== name; });
    var signedIn = name === 'anchor' || name === 'city';
    $('acct').hidden = !(signedIn || name === 'nobody');
    $('tabs').hidden = !signedIn;
    document.body.classList.toggle('docked', signedIn);
  }
  function setTabs(role) {
    var nav = clear('tabs');
    TABS[role].forEach(function (t) {
      nav.appendChild(el('button', { class: 'tab', role: 'tab', id: 't-' + t[0], 'data-v': t[0], 'aria-controls': 'v-' + t[0], 'aria-selected': 'false', onclick: function () { go(t[0], true); } }, icon(t[2]), t[1]));
    });
  }
  function go(name, focus) {
    var tab = $('t-' + name); if (!tab) return;
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) { v.classList.toggle('on', v.id === 'v-' + name); });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { b.setAttribute('aria-selected', String(b === tab)); });
    if (focus) { window.scrollTo(0, 0); var h = $('v-' + name).querySelector('[tabindex="-1"]'); if (h) h.focus({ preventScroll: true }); }
  }

  // ---------- connection ----------
  if (!CFG.url || !CFG.key || /YOUR/.test(CFG.url + CFG.key) || !window.supabase) {
    views('signin'); status('signinStatus', 'This page hasn\'t been connected to its database yet.', true); $('sendCode').disabled = true; return;
  }
  var sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  function call(fn, args) {
    return sb.rpc(fn, args || {}).then(function (r) { if (r.error) throw new Error(r.error.message || 'That didn\'t work.'); return r.data; });
  }

  // ---------- sign in ----------
  var emailEl = $('email'), codeEl = $('code');
  $('sendCode').addEventListener('click', function () {
    var email = emailEl.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status('signinStatus', 'That doesn\'t look like an email address.', true); return; }
    $('sendCode').disabled = true; status('signinStatus', 'Sending…');
    sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false } }).then(function (r) {
      $('sendCode').disabled = false;
      if (r.error) {
        var m = /signups not allowed|not found|otp_disabled/i.test(r.error.message + ' ' + (r.error.code || '')) ? 'That email isn\'t set up to sign in. Ask Actualize to add you.' : r.error.message;
        status('signinStatus', m, true); return;
      }
      $('step-email').hidden = true; $('step-code').hidden = false;
      $('codeSent').textContent = 'We\'ve emailed a code to ' + email + '. It works once, for an hour.';
      status('signinStatus', ''); codeEl.focus();
    });
  });
  emailEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('sendCode').click(); });
  $('verify').addEventListener('click', function () {
    var token = codeEl.value.replace(/\s/g, '');
    if (!/^\d{6,10}$/.test(token)) { status('signinStatus', 'The code is the number in the email.', true); return; }
    $('verify').disabled = true; status('signinStatus', 'Checking…');
    sb.auth.verifyOtp({ email: emailEl.value.trim().toLowerCase(), token: token, type: 'email' }).then(function (r) {
      $('verify').disabled = false;
      if (r.error) { status('signinStatus', 'That code didn\'t work. Check it, or ask for a new one.', true); return; }
      status('signinStatus', ''); start();
    });
  });
  codeEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('verify').click(); });
  $('otherEmail').addEventListener('click', function () { $('step-code').hidden = true; $('step-email').hidden = false; codeEl.value = ''; emailEl.focus(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-signout]'), function (b) {
    b.addEventListener('click', function () { sb.auth.signOut().then(function () { location.reload(); }); });
  });

  function start() {
    views('loading');
    call('whoami').then(function (w) {
      me = w;
      if (!w) { views('nobody'); return; }
      $('acctName').textContent = w.first_name;
      if (w.role === 'anchor') { $('brandName').textContent = w.crew_name; setTabs('anchor'); loadAnchor().then(function () { go('home'); }); }
      else if (w.role === 'city') { $('brandName').textContent = w.city_name; setTabs('city'); loadCity(); }
      else views('nobody');
    }, function (e) { views('signin'); status('signinStatus', e.message, true); });
  }

  // ================= anchor =================
  function men() { return crew.men.filter(function (m) { return m.active && m.role !== 'city'; }); }
  function byKey(k) { return crew.dinners.filter(function (d) { return d.key === k; })[0] || null; }
  function manName(id) { var m = crew.men.filter(function (x) { return x.id === id; })[0]; return m ? m.first_name : ''; }
  function person(id) { return crew.men.filter(function (x) { return x.id === id; })[0] || null; }
  function startOf(d) { return d.starts_at ? new Date(d.starts_at).getTime() : Infinity; }
  // soon: before check-in opens; tonight: open, not started; live: under way; after: finished, answers still open; done.
  function stateOf(d) {
    if (!d.starts_at) return 'nodate';
    var now = Date.now(), s = startOf(d), e = new Date(d.ends_at).getTime();
    if (now < s) return d.open ? 'tonight' : 'soon';
    if (now <= e) return 'live';
    return d.open ? 'after' : 'done';
  }
  function hostLine(d) { return !d.host_id ? 'No host yet' : d.host_id === me.id ? 'You host' : manName(d.host_id) + ' hosts'; }
  // The dinner that matters now: one taking answers, else the next not yet held, else the last one held.
  function focusDinner() {
    var ds = crew.dinners.slice();
    var open = ds.filter(function (d) { return d.open; }).sort(function (a, b) { return startOf(b) - startOf(a); })[0];
    if (open) return open;
    var pending = ds.filter(function (d) { return stateOf(d) !== 'done'; }).sort(function (a, b) { return a.n - b.n; })[0];
    return pending || lastDone();
  }
  function lastDone() { return crew.dinners.filter(function (d) { return stateOf(d) === 'done'; }).sort(function (a, b) { return startOf(a) - startOf(b); }).pop() || null; }
  function previousOf(d) { return crew.dinners.filter(function (x) { return x.n < d.n && stateOf(x) === 'done'; }).sort(function (a, b) { return b.n - a.n; })[0] || null; }
  function getReport(key, fresh) {
    if (!fresh && reports[key]) return Promise.resolve(reports[key]);
    return call('dinner_report', { p_dinner: key }).then(function (r) { reports[key] = r; return r; });
  }
  function loadProfile() {
    return sb.from('crew_profiles').select('data').eq('crew_id', me.crew_id).limit(1)
      .then(function (r) { return !r.error && r.data && r.data.length ? r.data[0].data : null; }, function () { return null; });
  }
  function loadAnchor(keep) {
    return Promise.all([call('anchor_crew'), call('crew_pulse', { p_weeks: 13 }).catch(function () { return []; }), profile ? Promise.resolve(profile) : loadProfile(),
      call('anchor_people').catch(function () { return []; })]).then(function (res) {
      crew = res[0]; pulse = res[1] || []; profile = res[2]; people = res[3] || [];
      if (!crew) { views('nobody'); return; }
      if (!keep || !sel || !byKey(sel)) {
        var open = crew.dinners.filter(function (d) { return d.open; })[0];
        sel = (open || lastDone() || focusDinner() || {}).key || null;
      }
      var f = focusDinner(), l = lastDone(), need = [];
      if (f && stateOf(f) !== 'soon' && stateOf(f) !== 'nodate') need.push(f.key);
      if (l) need.push(l.key);
      if (sel) need.push(sel);
      return Promise.all(need.filter(function (k, i) { return need.indexOf(k) === i; }).map(function (k) { return getReport(k, true).catch(function () { return null; }); }));
    }).then(function () {
      if (!crew) return;
      renderAnchor();
      views('anchor');
    });
  }
  function renderAnchor() {
    $('anchorMeta').textContent = 'Anchor · ' + me.first_name;
    $('crewName').textContent = crew.crew.name;
    $('lede').textContent = lede();
    renderNext(); renderLastTime(); renderTodo(); renderMessages(); renderCare(); renderMen(); renderAsks();
    renderDinners(); renderReport(); renderWeekly(); renderNudge();
    if (manOpen) openMan(manOpen);
    startLive();
  }
  function lede() {
    var n = men().filter(function (m) { return m.role === 'member'; }).length;
    var s = (NUM[n] || String(n)) + (n === 1 ? ' man' : ' men') + ' and you.';
    var f = focusDinner(); if (!f) return s;
    var st = stateOf(f), host = f.host_id === me.id ? 'you\'re hosting' : f.host_id ? manName(f.host_id) + ' is hosting' : '';
    var and = host ? ', and ' + host : '';
    if (st === 'nodate') return s + ' Dinner ' + f.n + ' needs a date.';
    if (st === 'live') return s + ' Dinner ' + f.n + ' is on now.';
    if (st === 'tonight') return s + ' Dinner ' + f.n + ' is tonight' + and + '.';
    if (st === 'after') return s + ' Dinner ' + f.n + ' just finished. Answers stay open until ' + timeLabel(new Date(f.ends_at).getTime() + DAY) + ' tomorrow.';
    if (st === 'done') return s + ' Every dinner on the list has been held.';
    var days = daysUntil(f.starts_at);
    return s + ' Dinner ' + f.n + ' is ' + (days <= 0 ? 'tonight' : days === 1 ? 'tomorrow' : days < 7 ? 'on ' + weekday(f.starts_at) : 'in ' + days + ' days') + and + '.';
  }

  // ---- the next dinner ----
  function ring(big, unit, frac, beat) {
    var word = typeof big === 'string';
    var box = el('div', { class: 'cd' + (word ? ' word' : '') + (beat ? ' pulse' : '') });
    var s = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
    s.appendChild(svg('circle', { class: 'cd-s', cx: 50, cy: 50, r: 49 }));
    s.appendChild(svg('circle', { class: 'cd-t', cx: 50, cy: 50, r: 45 }));
    var a = svg('circle', { class: 'cd-a', cx: 50, cy: 50, r: 45, pathLength: 100 }); a.style.setProperty('--f', (Math.max(frac, 0.04) * 100).toFixed(1));
    s.appendChild(a); box.appendChild(s);
    box.appendChild(el('b', { text: String(big) })); if (unit) { box.appendChild(document.createTextNode(' ')); box.appendChild(el('span', { text: unit })); }
    return box;
  }
  function arrivedPeople(r) { return (r && r.status || []).filter(function (p) { return p.arrived; }); }
  function renderNext() {
    var box = clear('next'), f = focusDinner();
    box.hidden = !f; if (!f) return;
    var st = stateOf(f), r = reports[f.key], days = f.starts_at ? Math.max(daysUntil(f.starts_at), 0) : null;
    var size = r ? r.crew_size : men().length, inCount = r ? r.arrived : 0;
    var k = { soon: days === 0 ? 'Tonight' : days === 1 ? 'Tomorrow' : 'Next up', tonight: 'Tonight, check-in is open', live: 'On now', after: 'Just held', done: 'Last dinner', nodate: 'Next up' }[st];
    // Before a dinner the ring counts down the days; once check-in opens it fills as men check in.
    box.appendChild(st === 'soon' ? (days === 0 ? ring('Tonight', null, 1) : ring(days, days === 1 ? 'day' : 'days', 1 - Math.min(days, 28) / 28))
      : st === 'tonight' || st === 'live' || st === 'after' ? ring(inCount, 'of ' + size + ' in', size ? inCount / size : 0, st !== 'after')
      : st === 'nodate' ? ring('No date', null, 0) : ring('Held', null, 1));
    box.appendChild(el('div', { class: 'head' }, el('p', { class: 'k', text: k }), el('h3', { text: 'Dinner ' + f.n + ' · ' + f.job }), el('p', { class: 'when', text: range(f) })));
    var host = person(f.host_id);
    var foot = el('div', { class: 'nfoot' }, faces(host ? [host] : [], hostLine(f), f.host_id));
    if (st === 'soon') {
      foot.appendChild(el('p', { class: 'small', style: 'margin-top:10px', text: days <= 7 ? 'Check-in opens three hours before. Print the table card now, or show the QR on your phone on the night.' : 'Check-in opens three hours before the dinner. Nothing to do for it until the week of.' }));
      foot.appendChild(el('div', { class: 'acts' }, btn('Table card', 'qr', function () { openQr(f); }, 'ghost sm'), btn('Date and host', 'cal', function () { openDate(f); }, 'ghost sm')));
    } else if (st === 'nodate') {
      foot.appendChild(el('p', { class: 'small', style: 'margin-top:10px', text: 'Agree a date in the crew chat, then set it here so the links and the table code know when to open.' }));
      foot.appendChild(el('div', { class: 'acts' }, btn('Set the date', 'cal', function () { openDate(f); })));
    } else if (st === 'done') {
      foot.appendChild(el('div', { class: 'acts' }, btn('See the report', 'arrow', function () { showReport(f.key); })));
    } else {
      var inNow = arrivedPeople(r);
      var live = el('div', { style: 'margin-top:12px', 'aria-live': 'polite' });
      if (inNow.length) live.appendChild(faces(inNow, joinNames(inNow.map(function (p) { return p.first_name; })) + (inNow.length === 1 ? ' is in.' : ' are in.'), null, 8));
      else live.appendChild(el('p', { class: 'small', text: 'Nobody has checked in yet. The QR is ready when they are.' }));
      if (st === 'after') live.appendChild(el('p', { class: 'small', style: 'margin-top:8px', text: 'Answers stay open until ' + timeLabel(new Date(f.ends_at).getTime() + DAY) + ' tomorrow, for anyone who missed the close.' }));
      foot.appendChild(live);
      foot.appendChild(el('div', { class: 'acts', style: 'align-items:center;gap:8px 18px' }, btn('Show the table QR', 'qr', function () { openQr(f); }),
        el('button', { class: 'linkbtn', type: 'button', onclick: function () { showReport(f.key); } }, 'See the report so far')));
    }
    box.appendChild(foot);
  }
  function renderLastTime() {
    var box = clear('lastTime'), f = focusDinner(), l = lastDone(), r = l && reports[l.key];
    box.hidden = !l || !r || l === f; if (box.hidden) return;
    var bits = [r.arrived + ' of ' + r.crew_size + ' checked in', plural(r.commitments, 'commitment', 'commitments')];
    if (r.kept + r.not_yet > 0) bits.push(r.kept + ' kept so far');
    box.appendChild(el('p', { class: 'k', text: 'Last time' }));
    box.appendChild(el('h3', { text: 'Dinner ' + l.n + ' · ' + l.job }));
    box.appendChild(el('p', { text: bits.join(' · ') }));
    if (r.averages) {
      var lh = lowHigh(r.averages), all = AREAS.filter(function (a) { return r.averages[a[0]] != null; }).map(function (a) { return Number(r.averages[a[0]]); });
      box.appendChild(el('p', { text: 'The crew averaged ' + (all.reduce(function (x, y) { return x + y; }, 0) / all.length).toFixed(1) + ', lowest on ' + areaList(lh.lo) + '.' }));
    }
    if (f && r.commitments && !(r.kept + r.not_yet)) box.appendChild(el('p', { class: 'small', style: 'margin-top:6px', text: 'Those commitments come back at dinner ' + f.n + ', where each man says if he kept his.' }));
    box.appendChild(el('button', { class: 'linkbtn', type: 'button', onclick: function () { showReport(l.key); } }, 'See the report'));
  }

  // ---- what needs doing ----
  function renderTodo() {
    var box = clear('todo'), list = men();
    var none = list.filter(function (m) { return !m.link_issued_at; }), unused = list.filter(function (m) { return m.link_issued_at && !m.link_used_at; });
    box.className = 'insight' + (none.length ? '' : ' calm');
    if (none.length) {
      box.appendChild(icon('link'));
      box.appendChild(el('div', null,
        el('b', { text: none.length === list.length ? 'Nobody has a link yet. ' : plural(none.length, 'man needs his link. ', 'men need their link. ') }),
        'Each man gets his own, sent to him directly. On his own phone it opens his space; anywhere else it only sends answers.',
        el('p', { class: 'small', style: 'margin-top:6px', text: 'Not yet: ' + joinNames(none.map(function (m) { return m.first_name; })) + '.' }),
        el('div', { class: 'acts' }, btn('Make ' + plural(none.length, 'link', 'links'), 'link', function () { makeLinks(none.map(function (m) { return m.id; }), []); }, null, 'makeLinks'))));
    } else if (unused.length) {
      box.appendChild(icon('check'));
      box.appendChild(el('div', null, 'Everyone has a link, and ', el('b', { text: (list.length - unused.length) + ' of ' + list.length }), ' have used theirs.',
        el('p', { class: 'small', style: 'margin-top:6px', text: 'Not used yet: ' + joinNames(unused.map(function (m) { return m.first_name; })) + '. If one went missing, Edit the list makes him a new one.' })));
    } else {
      box.appendChild(icon('check'));
      box.appendChild(el('div', null, el('b', { text: 'Every man has his link' }), ', and every one of them has used it.'));
    }
  }
  function message(l) {
    return 'Hi ' + l.first_name + ', here\'s your own link for our Breaking Bread dinners: ' + ROOT + '#k=' + l.key +
      '\nOpen it on your phone and tap "Yes, remember me". It becomes your space: your check-ins next to the crew\'s averages, only on that phone. Keep it to yourself, since anyone with it could answer as you.';
  }
  function makeLinks(ids, replacing) {
    if (replacing.length && !confirm('This switches off the current link for ' + joinNames(replacing) + '. Make a new one?')) return;
    status('menStatus', 'Making links…');
    call('issue_links', { p_people: ids }).then(function (links) {
      sent = links.map(function (l) { return { first_name: l.first_name, text: message(l), done: false }; }).concat(sent.filter(function (s) { return !links.some(function (l) { return l.first_name === s.first_name; }); }));
      status('menStatus', plural(links.length, 'link', 'links') + ' made.');
      return loadAnchor(true).then(function () { $('linkMessages').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    }, function (e) { status('menStatus', e.message, true); });
  }
  function renderMessages() {
    var box = clear('linkMessages');
    box.hidden = !sent.length; if (!sent.length) return;
    box.appendChild(el('div', { class: 'phead' }, el('h3', { text: 'Send each man his own link' }),
      el('button', { class: 'linkbtn', type: 'button', onclick: function () {
        if (sent.some(function (s) { return !s.done; }) && !confirm('Close these? The links won\'t show again. Any man you haven\'t sent one to can get a new one.')) return;
        sent = []; renderMessages();
      } }, 'Done, all sent')));
    box.appendChild(el('p', { class: 'small', style: 'margin-top:6px', text: 'One to one, not in the group chat. These show only this once. If one goes missing, make him a new one.' }));
    var list = el('div', { class: 'msgs' });
    sent.forEach(function (s) {
      var mark = function () { s.done = true; renderMessages(); };
      var acts = el('div', { class: 'acts' });
      if (navigator.share) acts.appendChild(btn('Share', 'share', function () { navigator.share({ text: s.text }).then(mark, function () {}); }, 'ghost sm'));
      acts.appendChild(btn('WhatsApp', 'chat', function () { window.open('https://wa.me/?text=' + encodeURIComponent(s.text), '_blank', 'noopener'); mark(); }, 'ghost sm'));
      acts.appendChild(btn('Copy message', 'copy', function () { copy(s.text, 'menStatus', mark); }, 'ghost sm'));
      list.appendChild(el('div', { class: 'msg' + (s.done ? ' sent' : '') },
        el('header', null, el('span', { class: 'av ' + (s.done ? 'used' : 'made'), text: ini(s.first_name) }), el('b', { text: s.first_name }), s.done ? el('span', { class: 'done', text: 'Sent' }) : null),
        el('pre', { text: s.text }), acts));
    });
    box.appendChild(list);
  }

  // ---- the crew ----
  function dinnersWord(ns) { return (ns.length === 1 ? 'dinner ' : 'dinners ') + joinNames(ns.map(String)); }
  function renderMen() {
    var list = clear('menList'), all = men();
    $('crewCount').textContent = all.length + ' on the list';
    all.forEach(function (m) {
      var cls = m.link_used_at ? 'used' : m.link_issued_at ? 'made' : 'none';
      var line = m.link_issued_at ? 'Link made ' + shortDay(m.link_issued_at) + (m.link_used_at ? ', used ' + shortDay(m.link_used_at) : ', not used yet') : 'No link yet';
      var hosting = crew.dinners.filter(function (d) { return d.host_id === m.id && stateOf(d) !== 'done'; }).map(function (d) { return d.n; });
      var tag = (m.role === 'anchor' ? 'Anchor' : '') + (hosting.length ? (m.role === 'anchor' ? ', hosts ' : 'Hosts ') + dinnersWord(hosting) : '');
      var sc = scoreOf(pp(m.id));
      list.appendChild(el('li', null,
        el('button', { class: 'who', type: 'button', 'aria-label': m.first_name + ', open his page', onclick: function () { openMan(m.id); } },
          el('span', { class: 'av ' + cls, text: ini(m.first_name) }),
          el('div', null, el('span', { class: 'nm', text: m.first_name }), el('span', { class: 'st', text: line }), tag ? el('span', { class: 'st note', text: tag }) : null)),
        el('div', { class: 'end' },
          tag ? el('span', { class: 'tag', text: tag }) : null,
          scoreChip(sc),
          el('div', { class: 'tools' },
            el('button', { class: 'btn ghost sm', type: 'button', onclick: function () { makeLinks([m.id], m.link_issued_at ? [m.first_name] : []); } }, m.link_issued_at ? 'New link' : 'Make link'),
            m.role === 'member' ? el('button', { class: 'btn ghost sm', type: 'button', onclick: function () { removeMan(m); } }, 'Take off') : null))));
    });
  }
  // ---- the connection score: dinners, the weekly, commitments kept, Circle. Unknowns are left out, not held against him. ----
  var WEIGHTS = { dinners: 40, weekly: 25, kept: 15, circle: 20 };
  function pp(id) { return people.filter(function (x) { return x.id === id; })[0] || { id: id, dinners: [], weeks: [], commitments: [], shared: [] }; }
  function monday(t) { var n = dayNum(t), dow = new Date(n * DAY).getUTCDay(); return n - ((dow + 6) % 7); }
  function isoDay(n) { return new Date(n * DAY).toISOString().slice(0, 10); }
  function noon(d) { return String(d).slice(0, 10) + 'T12:00:00Z'; }
  function daysAgo(d) { return Math.max(0, dayNum(Date.now()) - dayNum(noon(d))); }
  function agoText(days) { return days === 0 ? 'today' : days === 1 ? 'yesterday' : days < 21 ? days + ' days ago' : Math.round(days / 7) + ' weeks ago'; }
  // The weeks a man is counted as checked in: his weekly answers, plus any week he checked in at a dinner.
  function weeksDone(p) {
    var did = (p.dinners || []).filter(function (x) { return x.arrived; }).map(function (x) {
      var d = crew.dinners.filter(function (y) { return y.key === x.key; })[0];
      return d && d.starts_at ? isoDay(monday(startOf(d))) : null;
    }).filter(Boolean);
    return did.concat((p.weeks || []).map(function (w) { return String(w).slice(0, 10); }));
  }
  function scoreOf(p) {
    var parts = [], reasons = [];
    var held = crew.dinners.filter(function (d) { var s = stateOf(d); return s === 'done' || s === 'after'; }).sort(function (a, b) { return startOf(a) - startOf(b); });
    if (held.length) {
      var came = held.filter(function (d) { var x = (p.dinners || []).filter(function (y) { return y.key === d.key; })[0]; return x && x.arrived; });
      parts.push({ label: 'Dinners', got: came.length / held.length * WEIGHTS.dinners, max: WEIGHTS.dinners, text: came.length + ' of ' + held.length + ' held' });
      var lastHeld = held[held.length - 1];
      if (!came.some(function (d) { return d.key === lastHeld.key; })) reasons.push('Missed dinner ' + lastHeld.n);
    }
    if (p.link_issued_at) {
      var thisMon = monday(Date.now()), firstMon = monday(p.link_issued_at), did = weeksDone(p);
      var weeks = [];
      if (did.indexOf(isoDay(thisMon)) >= 0) weeks.push(isoDay(thisMon));
      for (var m = thisMon - 7; m >= firstMon && weeks.length < 4; m -= 7) weeks.push(isoDay(m));
      if (weeks.length) {
        var n = weeks.filter(function (w) { return did.indexOf(w) >= 0; }).length;
        parts.push({ label: 'Weekly check-in', got: n / weeks.length * WEIGHTS.weekly, max: WEIGHTS.weekly, text: n + ' of the last ' + plural(weeks.length, 'week', 'weeks') });
        var quiet = 0;
        for (var i = 0; i < weeks.length; i++) { if (weeks[i] === isoDay(thisMon)) continue; if (did.indexOf(weeks[i]) >= 0) break; quiet++; }
        if (quiet >= 2) reasons.push('No weekly check-in for ' + quiet + ' weeks');
      }
    }
    var asked = (p.commitments || []).filter(function (c) { return c.kept === true || c.kept === false; });
    if (asked.length) {
      var kept = asked.filter(function (c) { return c.kept; }).length;
      parts.push({ label: 'Commitments kept', got: kept / asked.length * WEIGHTS.kept, max: WEIGHTS.kept, text: kept + ' of ' + asked.length });
      if (asked[asked.length - 1].kept === false) reasons.push('Commitment from dinner ' + asked[asked.length - 1].n + ' not kept yet');
    }
    if (p.circle_seen_on) {
      var days = daysAgo(p.circle_seen_on);
      parts.push({ label: 'On Circle', got: days <= 7 ? 20 : days <= 14 ? 14 : days <= 30 ? 7 : 0, max: WEIGHTS.circle, text: 'last seen ' + agoText(days) });
      if (days > 21) reasons.push('Not on Circle for ' + agoText(days).replace(' ago', ''));
    }
    if (!parts.length) return { score: null, band: 'new', label: 'Not enough yet', parts: parts, reasons: reasons };
    var got = 0, max = 0; parts.forEach(function (x) { got += x.got; max += x.max; });
    var score = Math.round(got / max * 100), band = score >= 70 ? 'good' : score >= 40 ? 'watch' : 'drift';
    return { score: score, band: band, label: { good: 'Connected', watch: 'Worth watching', drift: 'Drifting' }[band], parts: parts, reasons: reasons };
  }
  function scoreChip(sc) {
    return el('span', { class: 'score ' + sc.band, title: sc.label }, el('i'), sc.score === null ? 'New' : String(sc.score));
  }
  // Who to check in with: lowest first, with the reason. Never a ranking of the whole crew.
  function renderCare() {
    var box = clear('careBox'), list = men().map(function (m) { return { m: m, p: pp(m.id), sc: scoreOf(pp(m.id)) }; });
    var flagged = list.filter(function (x) { return x.sc.score !== null && x.sc.band !== 'good'; }).sort(function (a, b) { return a.sc.score - b.sc.score; });
    var scored = list.filter(function (x) { return x.sc.score !== null; }).length;
    var checked = people.map(function (p) { return p.circle_checked_at; }).filter(Boolean).sort().pop();
    box.appendChild(el('div', { class: 'phead' }, el('h3', { text: 'Check in with' }),
      el('button', { class: 'linkbtn', type: 'button', onclick: openCircle }, 'Update Circle')));
    var sub = !scored ? 'Nobody to flag yet. Scores fill in from the dinners, the weekly check-in and Circle. Noting when each man was last on Circle starts them today.'
      : !flagged.length && scored < list.length ? 'Nobody to flag. ' + scored + ' of ' + list.length + ' men have a score so far; the rest fill in from the dinners, the weekly check-in and Circle.'
      : !flagged.length ? 'Everyone looks connected. Scores come from dinners, the weekly check-in, commitments and Circle.'
      : 'Lowest first, with the reason. Only you see this.';
    box.appendChild(el('p', { class: 'small', style: 'margin-top:4px', text: sub + (checked ? ' Circle last noted ' + agoText(daysAgo(checked)) + '.' : '') }));
    if (!flagged.length) return;
    var ul = el('ul', { class: 'care' });
    flagged.forEach(function (x) {
      ul.appendChild(el('li', null, el('button', { type: 'button', onclick: function () { openMan(x.m.id); } },
        el('span', { class: 'av made', text: ini(x.m.first_name) }),
        el('span', null, el('b', { text: x.m.first_name }), el('span', { class: 'why', text: x.sc.reasons.length ? x.sc.reasons.join('. ') + '.' : x.sc.label + '.' })),
        scoreChip(x.sc))));
    });
    box.appendChild(ul);
  }
  // A page per man: his score and why, Circle, his link, his commitments, and what he chose to share.
  function openMan(id) {
    var m = person(id); if (!m) { manOpen = null; $('manModal').hidden = true; return; }
    var fresh = $('manModal').hidden || manOpen !== id, keep = fresh ? 0 : $('manBox').scrollTop;
    manOpen = id;
    var p = pp(id), sc = scoreOf(p), box = clear('manBox');
    var cls = m.link_used_at ? 'used' : m.link_issued_at ? 'made' : 'none';
    box.appendChild(el('div', { class: 'mhead' }, el('span', { class: 'av ' + cls, text: ini(m.first_name) }),
      el('div', null, el('h3', { id: 'manName', tabindex: '-1', text: m.first_name }), el('span', { class: 'small', text: (m.role === 'anchor' ? 'Anchor' : 'Crew') + (p.paired ? ' · his phone is set up' : '') }))));
    box.appendChild(el('div', { class: 'bigscore' }, el('b', { text: sc.score === null ? '·' : String(sc.score) }), el('span', { text: sc.label })));
    var parts = el('div', { class: 'parts' });
    var have = sc.parts.map(function (x) { return x.label; });
    sc.parts.forEach(function (x) {
      parts.appendChild(el('div', { class: 'part' }, el('span', { text: x.label }), el('div', { class: 'track' }, el('i', { style: 'width:' + Math.round(x.got / x.max * 100) + '%' })), el('em', { text: x.text })));
    });
    [['Dinners', 'after his first dinner'], ['Weekly check-in', 'once his link is out'], ['Commitments kept', 'once he\'s asked about one'], ['On Circle', 'note it below']].forEach(function (x) {
      if (have.indexOf(x[0]) < 0) parts.appendChild(el('div', { class: 'part none' }, el('span', { text: x[0] }), el('div'), el('em', { text: x[1] })));
    });
    box.appendChild(parts);
    if (sc.reasons.length) box.appendChild(el('p', { class: 'small', style: 'margin-top:10px;color:var(--soft)', text: sc.reasons.join('. ') + '.' }));
    // Circle
    var circle = el('div', { class: 'msec' }, el('h4', { text: 'On Circle' }),
      el('p', { class: 'small', style: 'margin-top:6px', text: p.circle_seen_on ? 'Last seen ' + agoText(daysAgo(p.circle_seen_on)) + ', ' + shortDay(noon(p.circle_seen_on)) + '. Noted ' + agoText(daysAgo(p.circle_checked_at)) + '.' : 'Not noted yet. Open his Circle profile and note when he was last on.' }));
    circle.appendChild(circleForm(m, p, 'manStatus'));
    box.appendChild(circle);
    // his link
    var linkLine = m.link_issued_at ? 'Made ' + shortDay(m.link_issued_at) + (m.link_used_at ? ', used ' + shortDay(m.link_used_at) : ', not used yet') + (p.paired ? '. Remembered on his phone.' : '.') : 'No link yet.';
    box.appendChild(el('div', { class: 'msec' }, el('h4', { text: 'His link' }), el('p', { class: 'small', style: 'margin-top:6px', text: linkLine }),
      el('div', { class: 'acts' }, btn(m.link_issued_at ? 'Make him a new link' : 'Make his link', 'link', function () { $('manModal').hidden = true; manOpen = null; go('home'); makeLinks([m.id], m.link_issued_at ? [m.first_name] : []); }, 'ghost sm'))));
    // dinners and commitments
    var dl = (p.dinners || []).filter(function (d) { var x = byKey(d.key); return x && (stateOf(x) === 'done' || x.open); });
    var sec = el('div', { class: 'msec' }, el('h4', { text: 'Dinners and commitments' }));
    if (!dl.length && !(p.commitments || []).length) sec.appendChild(el('p', { class: 'small', style: 'margin-top:6px', text: 'Nothing yet. This fills in after his first dinner.' }));
    var ul = el('ul', { class: 'commits' });
    dl.forEach(function (d) {
      var c = (p.commitments || []).filter(function (x) { return x.dinner === d.key; })[0];
      ul.appendChild(el('li', null, el('b', { text: 'Dinner ' + d.n }),
        el('span', null, c ? c.commitment : d.arrived ? 'Came' + (d.closed ? ', stayed to the close' : '') : 'Didn\'t check in', c ? el('small', { text: (c.by_when || '') }) : null),
        el('span', { class: 'tag' + (c && c.kept === false ? ' on' : ''), text: c ? (c.kept === true ? 'Kept' : c.kept === false ? 'Not yet' : 'Asked next dinner') : d.arrived ? 'In' : 'Missed' })));
    });
    sec.appendChild(ul);
    box.appendChild(sec);
    // what he chose to share
    if ((p.shared || []).length) {
      var sh = el('div', { class: 'msec' }, el('h4', { text: 'Shared with you' }));
      var grid = el('div', { class: 'answers' });
      p.shared.forEach(function (s) { grid.appendChild(answerCard({ first_name: 'Dinner ' + s.n, scores: s.scores, problem: s.problem, area: s.area, offer: s.offer }, s.share === 'city' ? 'With you and Actualize' : 'With you', true)); });
      sh.appendChild(grid); box.appendChild(sh);
    }
    box.appendChild(el('div', { class: 'acts', style: 'margin-top:22px' }, btn('Close', null, function () { $('manModal').hidden = true; manOpen = null; }, 'sm', 'manClose')));
    box.appendChild(el('p', { class: 'status', id: 'manStatus', role: 'status' }));
    $('manModal').hidden = false;
    // A fresh page starts at the top with his name; after a save it stays where Jamie was.
    box.scrollTop = keep;
    if (!$('manModal').contains(document.activeElement)) $('manName').focus({ preventScroll: true });
  }
  function circleForm(m, p, statusId) {
    var input = el('input', { class: 'field', type: 'date', 'aria-label': 'When ' + m.first_name + ' was last on Circle', max: isoDay(dayNum(Date.now())) });
    if (p.circle_seen_on) input.value = String(p.circle_seen_on).slice(0, 10);
    var save = function (v) {
      status(statusId, 'Saving…');
      call('set_circle_seen', { p_person: m.id, p_seen_on: v || null }).then(function () { return loadAnchor(true); }).then(function () {
        if (!$('circleModal').hidden) openCircle();
        if ($(statusId)) status(statusId, m.first_name + ': noted.');
      }, function (e) { if ($(statusId)) status(statusId, e.message, true); });
    };
    return el('div', { class: 'rowform' }, input,
      el('button', { class: 'btn ghost sm', type: 'button', onclick: function () { save(input.value); } }, 'Save'),
      el('button', { class: 'btn ghost sm', type: 'button', onclick: function () { input.value = isoDay(dayNum(Date.now())); save(input.value); } }, 'Today'));
  }
  function openCircle() {
    var list = clear('circleList');
    men().forEach(function (m) {
      var p = pp(m.id);
      list.appendChild(el('li', null,
        el('div', null, el('b', { text: m.first_name }), el('span', { class: 'small', style: 'display:block', text: p.circle_seen_on ? 'Last seen ' + agoText(daysAgo(p.circle_seen_on)) : 'Not noted yet' })),
        circleForm(m, p, 'circleStatus')));
    });
    status('circleStatus', '');
    $('circleModal').hidden = false;
  }
  $('circleOpen').addEventListener('click', openCircle);
  $('circleDone').addEventListener('click', function () { $('circleModal').hidden = true; });
  // The weekly nudge, for the crew chat: who has done this week, and a message to send.
  function renderNudge() {
    var box = clear('nudgeBox'), list = men().filter(function (m) { return m.link_issued_at; });
    var open = crew.dinners.some(function (d) { return d.open; });
    box.hidden = !list.length || open; if (box.hidden) return;
    var wk = isoDay(monday(Date.now()));
    var done = list.filter(function (m) { return weeksDone(pp(m.id)).indexOf(wk) >= 0; });
    var notYet = list.filter(function (m) { return done.indexOf(m) < 0; });
    var dinnerWeek = crew.dinners.some(function (d) { return d.starts_at && isoDay(monday(startOf(d))) === wk && startOf(d) <= Date.now(); });
    var text = 'Weekly check-in is open. Tap your own link from me, it takes a minute, and you\'ll see the crew\'s week next to yours.';
    box.appendChild(el('div', { class: 'phead' }, el('h3', { text: 'This week: ' + done.length + ' of ' + list.length + ' checked in' })));
    box.appendChild(el('p', { class: 'small', style: 'margin-top:4px', text: (dinnerWeek ? 'Dinner counts as the week for the men who came. ' : '') + (notYet.length ? 'Not yet: ' + joinNames(notYet.map(function (m) { return m.first_name; })) + '. A nudge in the crew chat helps. It never shows what anyone said.' : 'Everyone has checked in this week.') }));
    if (!notYet.length) return;
    box.appendChild(el('pre', { style: 'margin:12px 0 0;white-space:pre-wrap;font:14px/1.5 var(--sans);color:var(--soft)', text: text }));
    box.appendChild(el('div', { class: 'acts' },
      btn('WhatsApp', 'chat', function () { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener'); }, 'ghost sm'),
      btn('Copy message', 'copy', function () { copy(text, 'nudgeStatus'); }, 'ghost sm')));
    box.appendChild(el('p', { class: 'status', id: 'nudgeStatus', role: 'status' }));
  }

  $('editMen').addEventListener('click', function () {
    var on = !$('crewPanel').classList.contains('editing');
    $('crewPanel').classList.toggle('editing', on);
    this.setAttribute('aria-pressed', String(on)); this.textContent = on ? 'Done editing' : 'Edit the list';
    if (on) $('newName').focus();
  });
  $('addMan').addEventListener('click', function () {
    var name = $('newName').value.trim();
    if (!name) { status('menStatus', 'Type his first name.', true); return; }
    call('add_member', { p_first_name: name }).then(function (r) { $('newName').value = ''; status('menStatus', r.first_name + ' is on the crew. Make him a link when you\'re ready.'); return loadAnchor(true); },
      function (e) { status('menStatus', e.message, true); });
  });
  $('newName').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('addMan').click(); });
  function removeMan(m) {
    if (!confirm('Take ' + m.first_name + ' off the crew list? His link stops working. His past answers stay in the totals.')) return;
    call('set_member_active', { p_person: m.id, p_active: false }).then(function () { status('menStatus', m.first_name + ' is off the list.'); return loadAnchor(true); },
      function (e) { status('menStatus', e.message, true); });
  }

  // ---- asks and offers, from Circle ----
  function renderAsks() {
    var themes = profile && profile.themes || [];
    $('asksBand').hidden = !themes.length; if (!themes.length) return;
    var asked = themes.filter(function (t) { return t.asking > 0; }).sort(function (a, b) { return b.asking - a.asking; });
    var helpers = function (t) { return (t.offering || []).map(person).filter(function (p) { return p && p.active; }); };
    var match = asked.filter(function (t) { return helpers(t).length; })[0], covered = asked.filter(function (t) { return helpers(t).length; }).length;
    var ins = clear('asksInsight');
    ins.hidden = !match;
    if (match) {
      var hs = helpers(match).map(function (p) { return p.first_name; });
      ins.appendChild(icon('spark'));
      ins.appendChild(el('div', null, el('b', { text: match.name + ': ' }), plural(match.asking, 'man is', 'men are') + ' asking, and ' + joinNames(hs) + (hs.length === 1 ? ' can' : ' can') + ' help. Worth an introduction at the table.',
        el('p', { class: 'small', style: 'margin-top:6px', text: 'Someone in the crew offers ' + covered + ' of the ' + asked.length + ' kinds of help the crew asks for.' })));
    }
    var box = clear('asks'), top = asked.length ? asked[0].asking : 1;
    asked.forEach(function (t) {
      var hs = helpers(t), meter = el('div', { class: 'meter' }, el('i', { style: 'width:' + Math.round(t.asking / top * 100) + '%' }));
      box.appendChild(el('div', { class: 'card' },
        el('div', { class: 'num' }, String(t.asking), el('small', { text: t.asking === 1 ? 'man asking' : 'men asking' })),
        el('h3', { text: t.name }), meter,
        hs.length ? faces(hs, joinNames(hs.map(function (p) { return p.first_name; })) + ' can help') : el('p', { text: 'Nobody in the crew lists this as an offer yet.' })));
    });
  }

  // ---- dinners and reports ----
  function renderDinners() {
    var ol = clear('dinnerList'), ds = crew.dinners;
    ol.style.gridTemplateColumns = 'repeat(' + Math.max(ds.length, 1) + ', minmax(0, 1fr))';
    ds.forEach(function (d) {
      var st = stateOf(d), tag = d.open ? 'Open now' : st === 'nodate' ? 'No date' : st === 'done' ? 'Held' : 'Coming';
      ol.appendChild(el('li', { class: 'item' + (st === 'done' ? ' done' : '') + (d.open ? ' open' : '') + (d.key === sel ? ' sel' : '') },
        el('button', { type: 'button', 'aria-pressed': String(d.key === sel), onclick: function () { sel = d.key; renderDinners(); renderReport(); } },
          el('span', { class: 'dot', text: String(d.n) }),
          el('span', null, el('span', { class: 'ttl', text: 'Dinner ' + d.n + ' · ' + d.job }), el('span', { class: 'when', text: range(d) }),
            el('span', { class: 'host', text: hostLine(d) }), el('span', { class: 'tag' + (d.open ? ' on' : ''), text: tag })))));
    });
  }
  function showReport(key) { sel = key; renderDinners(); renderReport(); go('dinners', true); }
  // The lowest and highest areas, ties included.
  function lowHigh(avgs) {
    var vals = AREAS.filter(function (a) { return avgs[a[0]] != null; }).map(function (a) { return Number(avgs[a[0]]); });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var at = function (v) { return AREAS.filter(function (a) { return avgs[a[0]] != null && Number(avgs[a[0]]) === v; }).map(function (a) { return a[0]; }); };
    return { min: min, max: max, lo: at(min), hi: at(max) };
  }
  function areaList(keys) { return joinNames(keys.map(areaName)); }
  function wedge(r0, r1, t0, t1) {
    var p = function (r, t) { return (100 + r * Math.cos(t)).toFixed(2) + ' ' + (100 + r * Math.sin(t)).toFixed(2); };
    return 'M' + p(r0, t0) + 'L' + p(r1, t0) + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + p(r1, t1) + 'L' + p(r0, t1) + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + p(r0, t0) + 'Z';
  }
  function wheel(avgs, lows) {
    var s = svg('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': 'The crew\'s averages across the nine areas' });
    var vals = [];
    AREAS.forEach(function (a, i) {
      var t0 = (-90 + i * 40 + 2) * Math.PI / 180, t1 = (-90 + (i + 1) * 40 - 2) * Math.PI / 180, v = avgs[a[0]];
      s.appendChild(svg('path', { class: 'w-slot', d: wedge(30, 94, t0, t1) }));
      if (v == null) return;
      vals.push(Number(v));
      var bar = svg('path', { class: 'w-bar' + (lows.indexOf(a[0]) >= 0 ? ' low' : ''), d: wedge(30, 30 + 64 * Number(v) / 5, t0, t1) });
      bar.appendChild(svg('title')).textContent = a[1] + ' ' + Number(v).toFixed(1);
      s.appendChild(bar);
    });
    var mid = svg('text', { x: 100, y: 106, 'text-anchor': 'middle', class: 'w-mid' });
    mid.textContent = vals.length ? (vals.reduce(function (x, y) { return x + y; }, 0) / vals.length).toFixed(1) : '';
    s.appendChild(mid);
    return el('div', { class: 'wheel' }, s);
  }
  function renderReport() {
    var d = sel && byKey(sel);
    $('reportBox').hidden = !d; if (!d) return;
    var st = stateOf(d), r = reports[d.key];
    $('reportTitle').textContent = 'Dinner ' + d.n + ' · ' + d.job;
    $('reportSub').textContent = [range(d), hostLine(d), d.open ? 'Open now' : st === 'done' ? 'Held' : ''].filter(Boolean).join(' · ');
    var q = $('qrOpen'); q.textContent = ''; q.className = 'btn' + (d.open ? '' : ' ghost'); q.appendChild(icon('qr')); q.appendChild(document.createTextNode(d.open ? 'Show the table QR' : 'Table card'));
    q.hidden = st === 'done'; $('dateOpen').hidden = st === 'done' || st === 'live' || st === 'after';
    if (!r) { $('reportBody').hidden = true; getReport(d.key).then(function () { if (sel === d.key) renderReport(); }, function () {}); return; }
    var empty = !r.arrived && (st === 'soon' || st === 'nodate');
    $('reportBody').hidden = false;
    renderReady(d, empty);
    Array.prototype.forEach.call(document.querySelectorAll('#reportBody .full'), function (x) { x.hidden = empty; });
    var stats = clear('reportStats');
    var fig = function (big, small, label) { stats.appendChild(el('div', null, el('b', null, String(big), small ? el('small', { text: small }) : null), el('span', { text: label }))); };
    fig(r.arrived, ' of ' + r.crew_size, 'Checked in');
    fig(r.closed, null, 'Stayed to the close');
    fig(r.commitments, null, 'Commitments');
    if (r.kept + r.not_yet > 0) fig(r.kept, ' of ' + (r.kept + r.not_yet), 'Kept, of those asked');
    var nextUp = crew.dinners.filter(function (x) { return x.n > d.n; }).sort(function (a, b) { return a.n - b.n; })[0];
    $('keptNote').textContent = r.commitments && !(r.kept + r.not_yet) ? (nextUp ? 'Commitments come back at dinner ' + nextUp.n + ', where each man says if he kept his.' : 'Each man says if he kept his commitment at the next dinner.') : '';
    // the wheel, against the dinner before when there is one
    var av = clear('reportAverages'), note = $('wheelNote');
    if (empty) {
      note.textContent = st === 'nodate' ? 'Set a date first. The report fills in as men check in.' : 'Fills in as men check in. Check-in opens three hours before.';
    } else if (!r.averages) {
      note.textContent = 'Shows once three or more men have checked in, so no one man can be picked out.';
    } else {
      var lh = lowHigh(r.averages), prev = previousOf(d), pr = prev && reports[prev.key];
      if (prev && !pr) getReport(prev.key).then(function () { if (sel === d.key) renderReport(); }, function () {});
      var pa = pr && pr.averages, moved = null;
      note.textContent = 'Lowest ' + (lh.lo.length > 1 ? 'are ' : 'is ') + areaList(lh.lo) + ' at ' + lh.min.toFixed(1) +
        (lh.max === lh.min ? '.' : ', highest ' + (lh.hi.length > 1 ? 'are ' : 'is ') + areaList(lh.hi) + ' at ' + lh.max.toFixed(1) + '.');
      var rows = el('div', { class: 'rows' });
      AREAS.forEach(function (a) {
        var v = r.averages[a[0]]; if (v == null) return;
        var dlt = pa && pa[a[0]] != null ? Number(v) - Number(pa[a[0]]) : null;
        if (dlt !== null && (moved === null || Math.abs(dlt) > Math.abs(moved.d))) moved = { k: a[0], d: dlt };
        var fill = el('i', { style: 'width:' + (Number(v) / 5 * 100) + '%' });
        rows.appendChild(el('div', { class: 'arow' + (lh.lo.indexOf(a[0]) >= 0 ? ' low' : '') }, el('span', { text: a[1] }), el('div', { class: 'track' }, fill), el('b', { text: Number(v).toFixed(1) }),
          el('em', { class: dlt === null ? null : dlt > 0.04 ? 'up' : dlt < -0.04 ? 'down' : null, title: prev ? 'Change since dinner ' + prev.n : null, text: dlt === null ? '' : Math.abs(dlt) < 0.05 ? 'same' : (dlt > 0 ? '+' : '−') + Math.abs(dlt).toFixed(1) })));
      });
      if (moved && Math.abs(moved.d) >= 0.05) note.textContent += ' Since dinner ' + prev.n + ', ' + areaName(moved.k) + ' moved most, ' + (moved.d > 0 ? 'up ' : 'down ') + Math.abs(moved.d).toFixed(1) + '.';
      av.appendChild(el('div', { class: 'wheelbox' }, wheel(r.averages, lh.lo), rows));
    }
    var ps = clear('reportStatus');
    r.status.forEach(function (p) {
      ps.appendChild(el('b', { class: p.arrived ? 'in' : null }, el('i', { text: ini(p.first_name) }), p.first_name, p.closed ? el('em', { text: ' closed' }) : null));
    });
    var cm = clear('reportCommits');
    if (!(r.commitments_list || []).length) cm.appendChild(el('li', { style: 'display:block' }, el('span', { class: 'small', text: empty ? 'Nothing yet.' : 'No commitments yet. They come in at the close.' })));
    (r.commitments_list || []).forEach(function (c) {
      cm.appendChild(el('li', null, el('b', { text: c.first_name }), el('span', null, c.commitment, el('small', { text: c.by_when || '' })),
        el('span', { class: 'tag' + (c.kept === false ? ' on' : ''), text: c.kept === true ? 'Kept' : c.kept === false ? 'Not yet' : 'Asked next dinner' })));
    });
    var sh = clear('reportShared');
    if (!r.shared.length) sh.appendChild(el('p', { class: 'small', style: 'margin-top:12px', text: empty ? 'Nothing yet.' : 'Nobody has shared answers with you for this dinner yet.' }));
    else { var grid = el('div', { class: 'answers' }); r.shared.forEach(function (s) { grid.appendChild(answerCard(s, s.share === 'city' ? 'Shared with you and Actualize' : 'Shared with you', true)); }); sh.appendChild(grid); }
  }
  // Before a dinner: what's ready and what isn't.
  function renderReady(d, show) {
    var box = clear('reportReady'); box.hidden = !show; if (!show) return;
    var list = men(), have = list.filter(function (m) { return m.link_issued_at; }), missing = list.filter(function (m) { return !m.link_issued_at; });
    var row = function (ok, title, detail, action) {
      box.appendChild(el('li', { class: ok ? 'ok' : null }, el('span', { class: 'mark' }, icon(ok ? 'check' : 'arrow')),
        el('div', null, el('b', { text: title }), detail ? el('span', { text: detail }) : null), action || el('span')));
    };
    box.appendChild(el('li', { class: 'head' }, el('p', { class: 'k', text: 'Before dinner ' + d.n })));
    row(!!d.starts_at, d.starts_at ? 'Date set' : 'No date yet', d.starts_at ? range(d) : 'Agree it in the crew chat, then set it here.',
      d.starts_at ? null : btn('Set the date', 'cal', function () { openDate(d); }, 'sm'));
    row(!!d.host_id, d.host_id ? hostLine(d) : 'No host yet', d.host_id ? null : 'Pick one so the men know where to go.',
      d.host_id ? null : btn('Pick a host', 'people', function () { openDate(d); }, 'ghost sm'));
    row(!missing.length, 'Links: ' + have.length + ' of ' + list.length + ' have theirs', missing.length ? 'Not yet: ' + joinNames(missing.map(function (m) { return m.first_name; })) + '.' : 'Every man can check in from his phone.',
      missing.length ? btn('Make ' + plural(missing.length, 'link', 'links'), 'link', function () { go('home', true); makeLinks(missing.map(function (m) { return m.id; }), []); }, 'sm') : null);
    row(false, 'Table card', d.starts_at ? 'Check-in opens at ' + timeLabel(startOf(d) - H3) + ' on the day. Print the card, or show the QR on your phone.' : 'Ready once the date is set.',
      btn('Table card', 'qr', function () { openQr(d); }, 'ghost sm'));
  }
  function answerCard(s, tagText, withOffer) {
    var card = el('article', { class: 'answer' }, el('header', null, el('h3', { text: s.first_name }), el('span', { class: 'tag', text: tagText })));
    var q = function (label, body) { card.appendChild(el('div', { class: 'q' }, el('i', { text: label }), body)); };
    var scored = AREAS.filter(function (a) { return s.scores && s.scores[a[0]]; });
    if (scored.length) {
      var lo = Math.min.apply(null, scored.map(function (a) { return s.scores[a[0]]; }));
      var standsOut = scored.filter(function (a) { return s.scores[a[0]] === lo; }).length <= 2;
      q('Scores', el('div', { class: 'chipset' }, scored.map(function (a) { return el('span', { class: standsOut && s.scores[a[0]] === lo ? 'r' : null, text: a[1] + ' ' + s.scores[a[0]] }); }).reduce(function (f, n) { f.appendChild(n); return f; }, document.createDocumentFragment())));
    }
    if (s.problem) q('Brought', el('div', { text: s.problem + (s.area ? ' (' + areaName(s.area) + ')' : '') }));
    if (s.commitment) q('Commitment', el('div', null, el('span', { class: 'will', text: s.commitment }), s.by_when ? el('span', { class: 'small', text: ' · ' + s.by_when }) : null));
    if (withOffer && s.offer) q('Can help with', el('div', { text: s.offer }));
    if (s.kept === true || s.kept === false) q('Kept', el('div', { text: s.kept ? 'Yes' : 'Not yet' }));
    return card;
  }
  $('qrOpen').addEventListener('click', function () { var d = byKey(sel); if (d) openQr(d); });
  $('dateOpen').addEventListener('click', function () { var d = byKey(sel); if (d) openDate(d); });

  // ---- between dinners ----
  function renderWeekly() {
    var box = clear('pulseBox'), ins = clear('pulseInsight'), rows = pulse || [];
    ins.hidden = !rows.length;
    if (!rows.length) { box.appendChild(el('p', { class: 'small', style: 'margin-top:22px', text: 'Nothing yet. A week shows here once three or more men answer it.' })); return; }
    var last = rows[rows.length - 1], prev = rows[rows.length - 2], d = prev ? Number(last.average) - Number(prev.average) : null;
    ins.appendChild(icon('pulse'));
    ins.appendChild(el('div', null, el('b', { text: 'Week of ' + shortDay(last.week + 'T12:00:00Z') + ': ' }),
      plural(Number(last.answered), 'man', 'men') + ' answered, and the crew averaged ' + Number(last.average).toFixed(1) + ' out of 5' +
      (d === null ? '.' : Math.abs(d) < 0.05 ? ', the same as the week before.' : ', ' + (d > 0 ? 'up ' : 'down ') + Math.abs(d).toFixed(1) + ' on the week before.')));
    var byWeek = {}; rows.forEach(function (w) { byWeek[w.week] = w; });
    var mondayOf = function (t) { var n = dayNum(t), dow = new Date(n * DAY).getUTCDay(); return n - ((dow + 6) % 7); };
    var iso = function (n) { return new Date(n * DAY).toISOString().slice(0, 10); };
    var thisWeek = mondayOf(Date.now()), first = Math.max(mondayOf(rows[0].week + 'T12:00:00Z') - 7, thisWeek - 12 * 7);
    var dinnersIn = {}; crew.dinners.forEach(function (d) { if (d.starts_at) dinnersIn[iso(mondayOf(d.starts_at))] = d; });
    var chart = el('div', { class: 'weeks', role: 'img', 'aria-label': 'The crew\'s weekly average' }), labels = el('div', { class: 'wkl', 'aria-hidden': 'true' });
    for (var n = first; n <= thisWeek; n += 7) {
      var key = iso(n), w = byWeek[key], dn = dinnersIn[key];
      chart.appendChild(w ? el('div', { class: 'wk' + (key === last.week ? ' last' : '') + (dn ? ' din' : '') }, el('b', { text: Number(w.average).toFixed(1) }), el('i', { style: 'height:' + (Number(w.average) / 5 * 170).toFixed(0) + 'px' }))
        : el('div', { class: 'wk none' + (dn ? ' din' : '') }, el('b', { text: '·' }), el('i')));
      labels.appendChild(el('span', { class: dn ? 'din' : null }, shortDay(key + 'T12:00:00Z'), el('small', { text: w ? w.answered + ' in' : n === thisWeek ? 'so far' : 'under 3' }), dn ? el('em', { text: 'Dinner ' + dn.n }) : null));
    }
    var width = ((thisWeek - first) / 7 + 1) * 110 + 'px';
    chart.style.maxWidth = width; labels.style.maxWidth = width;
    box.appendChild(chart); box.appendChild(labels);
    box.appendChild(el('p', { class: 'small', style: 'margin-top:14px', text: 'Each bar is the crew\'s average across the nine areas, out of 5. A blank week means fewer than three men answered it.' }));
  }

  // ---- live on the night ----
  function startLive() {
    clearInterval(liveTimer); liveTimer = null;
    if (!crew.dinners.some(function (d) { return d.open; })) return;
    liveTimer = setInterval(function () {
      if (document.hidden) return;
      var open = crew.dinners.filter(function (d) { return d.open; });
      Promise.all(open.map(function (d) { return getReport(d.key, true); })).then(function () {
        renderNext(); renderLastTime(); if (open.some(function (d) { return d.key === sel; })) renderReport(); renderQrLive();
      }, function () {});
    }, 20000);
  }

  // ---- table code ----
  function tableUrl(d) { return ROOT + '#t=' + d.key + '.' + d.table_code; }
  function renderQrLive() {
    var box = $('qrLive');
    if (!qrDinner || $('qrModal').hidden) return;
    var r = reports[qrDinner.key];
    box.hidden = !(qrDinner.open && r); if (box.hidden) return;
    box.textContent = '';
    box.appendChild(el('b', { text: String(r.arrived) })); box.appendChild(document.createTextNode(' ')); box.appendChild(el('span', { text: 'of ' + r.crew_size + ' checked in' }));
  }
  function openQr(d) {
    qrDinner = d;
    $('qrTitle').textContent = crew.crew.name + ' · Dinner ' + d.n;
    $('qrNote').textContent = d.open ? 'Scan to check in.' : 'Scan to check in. Works from three hours before the dinner until a day after.';
    var url = tableUrl(d);
    var qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
    $('qrImage').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    $('qrUrl').textContent = url;
    status('qrStatus', '');
    $('qrModal').hidden = false; $('qrClose').focus();
    renderQrLive();
    if (d.open) getReport(d.key, true).then(renderQrLive, function () {});
  }
  $('qrCopy').addEventListener('click', function () { copy(tableUrl(qrDinner), 'qrStatus'); });
  $('qrPrint').addEventListener('click', function () { window.print(); });
  $('qrClose').addEventListener('click', function () { $('qrModal').hidden = true; });
  $('qrNew').addEventListener('click', function () {
    if (!confirm('Make a new code? Printed cards and shared links for this dinner stop working.')) return;
    var key = qrDinner.key;
    call('new_table_code', { p_dinner: key }).then(function () {
      return loadAnchor(true).then(function () { openQr(byKey(key)); status('qrStatus', 'New code made. The old one no longer works.'); });
    }, function (e) { status('qrStatus', e.message, true); });
  });

  // ---- date and host ----
  function openDate(d) {
    dateDinner = d;
    $('dateTitle').textContent = 'Dinner ' + d.n + ' · ' + d.job;
    var host = clear('dHost');
    host.appendChild(el('option', { value: '', text: 'Not set' }));
    men().forEach(function (m) { var o = el('option', { value: m.id, text: m.first_name }); if (m.id === d.host_id) o.selected = true; host.appendChild(o); });
    if (d.starts_at) { var s = localParts(d.starts_at), e = localParts(d.ends_at); $('dDate').value = s.date; $('dStart').value = s.time; $('dEnd').value = e.time; }
    else { $('dDate').value = ''; $('dStart').value = '18:30'; $('dEnd').value = '20:30'; }
    status('dStatus', '');
    $('dateModal').hidden = false; $('dDate').focus();
  }
  $('dCancel').addEventListener('click', function () { $('dateModal').hidden = true; });
  $('dSave').addEventListener('click', function () {
    var date = $('dDate').value, s = $('dStart').value, e = $('dEnd').value;
    if (!date || !s || !e) { status('dStatus', 'Pick a date and both times.', true); return; }
    var starts = zonedToUtc(date, s, tz()), ends = zonedToUtc(date, e, tz());
    call('save_dinner', { p_dinner: dateDinner.key, p_starts_at: starts, p_ends_at: ends, p_host: $('dHost').value || null }).then(function () {
      $('dateModal').hidden = true; return loadAnchor(true);
    }, function (err) { status('dStatus', err.message, true); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('qrModal').hidden = true; $('dateModal').hidden = true; $('manModal').hidden = true; $('circleModal').hidden = true; manOpen = null; } });

  // ================= Actualize =================
  function loadCity() {
    return Promise.all([call('city_summary'), call('city_shared')]).then(function (res) {
      var rows = res[0] || [], shared = res[1] || [];
      var sum = function (k) { return rows.reduce(function (t, c) { return t + (Number(c[k]) || 0); }, 0); };
      $('cityMeta').textContent = 'Actualize · ' + me.first_name;
      $('cityName').textContent = me.city_name;
      var nm = sum('men'), ck = sum('checkins');
      $('cityLede').textContent = (NUM[rows.length] || String(rows.length)) + (rows.length === 1 ? ' crew and ' : ' crews and ') + plural(nm, 'man', 'men') + '. ' +
        (ck ? plural(ck, 'check-in', 'check-ins') + ' so far.' : 'No check-ins yet.');
      var figs = clear('cityFigs');
      [[rows.length, 'Crews'], [nm, 'Men'], [sum('dinners_held'), 'Dinners held'], [ck, 'Check-ins'], [sum('commitments'), 'Commitments'], [sum('kept'), 'Kept']].forEach(function (f) {
        figs.appendChild(el('div', null, el('b', { text: String(f[0]) }), el('span', { text: f[1] })));
      });
      var waiting = rows.filter(function (c) { return !c.dinners_held; }).map(function (c) { return c.crew; });
      var ins = clear('cityInsight');
      ins.hidden = !waiting.length && !shared.length;
      if (waiting.length) { ins.appendChild(icon('dinner')); ins.appendChild(el('div', null, el('b', { text: joinNames(waiting) }), (waiting.length === 1 ? ' hasn\'t' : ' haven\'t') + ' held a dinner yet.')); }
      else if (shared.length) { ins.appendChild(icon('shared')); ins.appendChild(el('div', null, el('b', { text: plural(shared.length, 'answer', 'answers') }), ' shared with Actualize so far. They\'re under Shared.')); }
      var box = clear('cityCrews');
      rows.forEach(function (c) {
        var asks = (c.asks || []).filter(function (a) { return a.asking > 0; }).sort(function (a, b) { return b.asking - a.asking; }).slice(0, 3);
        var mini = el('div', { class: 'figs four' });
        [[c.dinners_held, 'Dinners held'], [c.checkins, 'Check-ins'], [c.commitments, 'Commitments'], [c.kept, 'Kept']].forEach(function (f) {
          mini.appendChild(el('div', null, el('b', { text: String(f[0]) }), el('span', { text: f[1] })));
        });
        box.appendChild(el('div', { class: 'card' },
          el('header', null, el('h3', { text: c.crew }), el('span', { class: 'tag', text: plural(Number(c.men), 'man', 'men') })), mini,
          el('p', { class: 'small', text: !c.dinners_held ? 'No dinner held yet.' : c.last_dinner_average == null ? 'Last dinner average shows at three answers.' : 'Last dinner averaged ' + Number(c.last_dinner_average).toFixed(1) + ' out of 5.' }),
          asks.length ? el('p', { text: 'Top asks: ' + asks.map(function (a) { return a.theme + ' (' + a.asking + ')'; }).join(', ') }) : null));
      });
      var themes = {};
      rows.forEach(function (c) { (c.asks || []).forEach(function (a) { var t = themes[a.theme] || (themes[a.theme] = { name: a.theme, asking: 0, offering: 0 }); t.asking += a.asking; t.offering += a.offering; }); });
      var list = Object.keys(themes).map(function (k) { return themes[k]; }).filter(function (t) { return t.asking > 0; }).sort(function (a, b) { return b.asking - a.asking; });
      $('cityAsksBand').hidden = !list.length;
      var ab = clear('cityAsks'), top = list.length ? list[0].asking : 1;
      list.forEach(function (t) {
        ab.appendChild(el('div', { class: 'card' }, el('div', { class: 'num' }, String(t.asking), el('small', { text: t.asking === 1 ? 'man asking' : 'men asking' })),
          el('h3', { text: t.name }), el('div', { class: 'meter' }, el('i', { style: 'width:' + Math.round(t.asking / top * 100) + '%' })),
          el('p', { text: t.offering ? plural(t.offering, 'man', 'men') + ' in the city could help.' : 'Nobody lists this as an offer yet.' })));
      });
      var sh = clear('cityShared');
      if (!shared.length) sh.appendChild(el('p', { class: 'small', style: 'margin-top:22px', text: 'Nobody has shared answers with Actualize yet.' }));
      else { var grid = el('div', { class: 'answers' }); shared.forEach(function (s) { grid.appendChild(answerCard(s, s.crew + ' · dinner ' + s.dinner, false)); }); sh.appendChild(grid); }
      views('city'); go('cityhome');
    }, function (e) { views('city'); go('cityhome'); $('cityLede').textContent = e.message; });
  }

  sb.auth.getSession().then(function (r) { if (r.data && r.data.session) start(); else views('signin'); });
})();
