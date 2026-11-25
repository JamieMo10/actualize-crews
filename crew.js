// Actualize crews: sign-in and dashboards for anchors and city leads.
// Every number and answer comes from database functions that check who is asking.
(function () {
  'use strict';
  var CFG = window.CREWS_CONFIG || {};
  var AREAS = [['money', 'Money'], ['career', 'Career'], ['health', 'Health'], ['fun', 'Fun'], ['environment', 'Environment'],
    ['community', 'Community'], ['family', 'Family'], ['partner', 'Partner'], ['growth', 'Growth']];
  var $ = function (id) { return document.getElementById(id); };
  var areaName = function (k) { var f = AREAS.filter(function (a) { return a[0] === k; })[0]; return f ? f[1] : k; };
  var ROOT = new URL('./', location.href).href;
  var me = null, crew = null, sel = null;

  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  }
  function views(name) { ['loading', 'signin', 'nobody', 'anchor', 'city'].forEach(function (v) { $('v-' + v).hidden = v !== name; }); }
  function status(id, msg, warn) { $(id).textContent = msg || ''; $(id).classList.toggle('warn', !!warn); }
  function fmtDate(iso) {
    if (!iso) return 'Date to come';
    var tz = (me && me.tz) || undefined, d = new Date(iso);
    var day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(d).replace(',', '');
    var time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(d).toLowerCase().replace(/\u202f/g, ' ');
    return day + ' · ' + time;
  }
  function localParts(iso) {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: me.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
    var g = function (t) { return parts.filter(function (p) { return p.type === t; })[0].value; };
    return { date: g('year') + '-' + g('month') + '-' + g('day'), time: g('hour') + ':' + g('minute') };
  }
  // A wall-clock time in the crew's city, as a moment in time.
  function zonedToUtc(date, time, tz) {
    var d = date.split('-').map(Number), t = time.split(':').map(Number);
    var want = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]), guess = want;
    for (var i = 0; i < 3; i++) {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
      var g = function (ty) { return Number(parts.filter(function (p) { return p.type === ty; })[0].value); };
      guess += want - Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
    }
    return new Date(guess).toISOString();
  }
  function copy(text, statusId) {
    var done = function () { status(statusId, 'Copied.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { status(statusId, 'Copy didn\'t work. Select the text and copy it.', true); });
    else status(statusId, 'Select the text and copy it.', true);
  }

  if (!CFG.url || !CFG.key || /YOUR/.test(CFG.url + CFG.key) || !window.supabase) {
    views('signin'); status('signinStatus', 'This page hasn\'t been connected to its database yet.', true); $('sendCode').disabled = true; return;
  }
  var sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  function call(fn, args) {
    return sb.rpc(fn, args || {}).then(function (r) { if (r.error) throw new Error(r.error.message || 'That didn\'t work.'); return r.data; });
  }

  // ---- sign in ----
  var emailEl = $('email'), codeEl = $('code');
  $('sendCode').addEventListener('click', function () {
    var email = emailEl.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status('signinStatus', 'That doesn\'t look like an email address.', true); return; }
    $('sendCode').disabled = true; status('signinStatus', 'Sending…');
    sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false } }).then(function (r) {
      $('sendCode').disabled = false;
      if (r.error) {
        var m = /signups not allowed|not found|otp_disabled/i.test(r.error.message + ' ' + (r.error.code || '')) ? 'That email isn\'t set up to sign in. Ask whoever runs your city.' : r.error.message;
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

  // ---- after sign in ----
  function start() {
    views('loading');
    call('whoami').then(function (w) {
      me = w;
      if (!w) { views('nobody'); return; }
      $('kicker').textContent = 'Actualize · ' + (w.role === 'city' ? w.city_name : w.crew_name);
      if (w.role === 'anchor') loadAnchor(); else if (w.role === 'city') loadCity(); else views('nobody');
    }, function (e) { views('signin'); status('signinStatus', e.message, true); });
  }

  // ---- anchor ----
  function loadAnchor(keepSel) {
    return call('anchor_crew').then(function (c) {
      crew = c;
      $('crewName').textContent = c.crew.name;
      $('anchorMeta').textContent = 'Anchor · ' + me.first_name;
      drawDinners();
      drawMen();
      var pick = keepSel && sel ? sel : pickDinner();
      if (pick) openReport(pick);
      loadPulse();
      views('anchor');
    });
  }
  function pickDinner() {
    var now = Date.now(), ds = crew.dinners;
    var open = ds.filter(function (d) { return d.open; })[0];
    if (open) return open.key;
    var past = ds.filter(function (d) { return d.ends_at && new Date(d.ends_at).getTime() < now; });
    return past.length ? past[past.length - 1].key : null;
  }
  function manName(id) { var m = crew.men.filter(function (x) { return x.id === id; })[0]; return m ? m.first_name : ''; }
  function drawDinners() {
    var box = $('dinnerList'); box.textContent = '';
    crew.dinners.forEach(function (d) {
      var state = d.open ? el('span', { class: 'tag on', text: 'Open now' })
        : !d.starts_at ? el('span', { class: 'tag', text: 'No date' })
        : new Date(d.ends_at).getTime() < Date.now() ? el('span', { class: 'tag', text: 'Done' }) : el('span', { class: 'tag', text: 'Coming' });
      box.appendChild(el('div', { class: 'item' },
        el('div', { class: 'who' }, el('b', { text: 'Dinner ' + d.n + ' · ' + d.job }),
          el('span', { text: fmtDate(d.starts_at) + (d.host_id ? ' · ' + manName(d.host_id) + ' hosts' : '') }), state),
        el('div', { class: 'row' },
          el('button', { class: 'ghost sm', type: 'button', text: 'Report', onclick: function () { openReport(d.key); } }),
          el('button', { class: 'ghost sm', type: 'button', text: 'Table code', onclick: function () { openQr(d); } }),
          el('button', { class: 'ghost sm', type: 'button', text: 'Date and host', onclick: function () { openDate(d); } }))));
    });
  }
  function openReport(key) {
    sel = key;
    call('dinner_report', { p_dinner: key }).then(function (r) {
      if (!r) return;
      $('reportBox').hidden = false;
      $('reportTitle').textContent = 'Dinner ' + r.dinner.n + ' · ' + r.dinner.job + (r.dinner.open ? ' · open now' : '');
      var stats = $('reportStats'); stats.textContent = '';
      [[r.arrived + ' of ' + r.crew_size, 'Checked in'], [r.closed, 'Closed'], [r.commitments, 'Commitments'], [r.kept, 'Kept'], [r.not_yet, 'Not yet']]
        .forEach(function (s) { stats.appendChild(el('div', { class: 'stat' }, el('b', { text: String(s[0]) }), el('span', { text: s[1] }))); });
      var av = $('reportAverages'); av.textContent = '';
      if (r.averages) {
        var low = null;
        AREAS.forEach(function (a) { var v = r.averages[a[0]]; if (v != null && (low === null || v < r.averages[low])) low = a[0]; });
        var bars = el('div', { class: 'bars' });
        AREAS.forEach(function (a) {
          var v = r.averages[a[0]]; if (v == null) return;
          bars.appendChild(el('span', { class: 'bl', text: a[1] }));
          var fill = el('div', { class: 'bf' + (a[0] === low ? ' low' : '') }); fill.style.width = (v / 5 * 100) + '%';
          bars.appendChild(el('div', { class: 'bt' }, fill));
          bars.appendChild(el('span', { class: 'bv', text: Number(v).toFixed(1) }));
        });
        av.appendChild(bars);
      } else {
        av.appendChild(el('p', { class: 'small', text: 'Averages show once three or more men have checked in.' }));
      }
      var ps = $('reportStatus'); ps.textContent = '';
      r.status.forEach(function (p) {
        var mark = p.closed ? 'closed' : p.arrived ? 'arrived' : 'not yet';
        ps.appendChild(el('span', { class: 'person' + (p.arrived ? ' yes' : '') }, p.first_name + ' ', el('em', { text: mark })));
      });
      var sh = $('reportShared'); sh.textContent = '';
      if (!r.shared.length) sh.appendChild(el('p', { class: 'small', text: 'Nobody has shared answers with you for this dinner yet.' }));
      r.shared.forEach(function (s) {
        var scores = AREAS.filter(function (a) { return s.scores && s.scores[a[0]]; }).map(function (a) { return a[1] + ' ' + s.scores[a[0]]; }).join(' · ');
        var box = el('div', { class: 'answer' }, el('div', { class: 'row between' }, el('h3', { text: s.first_name }),
          el('span', { class: 'tag', text: s.share === 'city' ? 'Shared with you and the city lead' : 'Shared with you' })));
        [['Scores', scores], ['Brought', s.problem ? s.problem + (s.area ? ' (' + areaName(s.area) + ')' : '') : ''], ['Commitment', s.commitment ? s.commitment + (s.by_when ? ' · ' + s.by_when : '') : ''],
          ['Can help with', s.offer], ['Kept', s.kept === true ? 'Yes' : s.kept === false ? 'Not yet' : '']]
          .forEach(function (q) { if (q[1]) box.appendChild(el('div', { class: 'q' }, el('i', { text: q[0] }), q[1])); });
        sh.appendChild(box);
      });
    }, function (e) { $('reportBox').hidden = false; $('reportTitle').textContent = e.message; });
  }
  function drawMen() {
    var box = $('menList'); box.textContent = '';
    crew.men.filter(function (m) { return m.active; }).forEach(function (m) {
      var line = m.link_issued_at ? 'Link made ' + new Date(m.link_issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + (m.link_used_at ? ', used ' + new Date(m.link_used_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ', not used yet') : 'No link yet';
      var tick = el('input', { type: 'checkbox', 'data-man': m.id });
      if (!m.link_issued_at) tick.checked = true;
      box.appendChild(el('div', { class: 'item' },
        el('label', { class: 'who check' }, tick, el('b', { text: m.first_name + (m.role === 'anchor' ? ' (anchor)' : '') }), el('span', { text: line })),
        m.role === 'member' ? el('button', { class: 'ghost sm', type: 'button', text: 'Take off the list', onclick: function () { removeMan(m); } }) : null));
    });
  }
  $('makeLinks').addEventListener('click', function () {
    var ids = Array.prototype.map.call(document.querySelectorAll('#menList input:checked'), function (i) { return i.getAttribute('data-man'); });
    if (!ids.length) { status('menStatus', 'Tick the men who need a link.', true); return; }
    var replacing = crew.men.filter(function (m) { return ids.indexOf(m.id) >= 0 && m.link_issued_at; }).map(function (m) { return m.first_name; });
    if (replacing.length && !confirm('This switches off the old links for ' + replacing.join(', ') + '. Make new ones?')) return;
    status('menStatus', 'Making links…');
    call('issue_links', { p_people: ids }).then(function (links) {
      var box = $('linkMessages'); box.textContent = '';
      box.appendChild(el('p', { class: 'small', text: 'Send each man his own message in the crew chat. These links show only now; if one goes missing, make him a new one.' }));
      links.forEach(function (l) {
        var text = 'Hi ' + l.first_name + ', here\'s your private check-in link for our Breaking Bread dinners: ' + ROOT + '#k=' + l.key +
          '\nIt only sends your answers and never shows them back. Keep it to yourself, since anyone with it could answer as you.';
        box.appendChild(el('div', { class: 'msg' }, el('div', { class: 'row between' }, el('b', { text: l.first_name }),
          el('button', { class: 'ghost sm', type: 'button', text: 'Copy message', onclick: function () { copy(text, 'menStatus'); } })), el('pre', { text: text })));
      });
      status('menStatus', links.length + (links.length === 1 ? ' link' : ' links') + ' made.');
      return loadAnchor(true);
    }, function (e) { status('menStatus', e.message, true); });
  });
  $('addMan').addEventListener('click', function () {
    var name = $('newName').value.trim();
    if (!name) { status('menStatus', 'Type his first name.', true); return; }
    call('add_member', { p_first_name: name }).then(function (r) { $('newName').value = ''; status('menStatus', r.first_name + ' is on the list. Make him a link.'); return loadAnchor(true); },
      function (e) { status('menStatus', e.message, true); });
  });
  function removeMan(m) {
    if (!confirm('Take ' + m.first_name + ' off the crew list? His link stops working. His past answers stay in the totals.')) return;
    call('set_member_active', { p_person: m.id, p_active: false }).then(function () { status('menStatus', m.first_name + ' is off the list.'); return loadAnchor(true); },
      function (e) { status('menStatus', e.message, true); });
  }
  function loadPulse() {
    call('crew_pulse', { p_weeks: 13 }).then(function (rows) {
      var box = $('pulseBox'); box.textContent = '';
      if (!rows || !rows.length) { box.appendChild(el('p', { class: 'small', text: 'A week shows here once three or more men answer it.' })); return; }
      var bars = el('div', { class: 'bars' });
      rows.forEach(function (w) {
        bars.appendChild(el('span', { class: 'bl', text: new Date(w.week + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + w.answered }));
        var fill = el('div', { class: 'bf' }); fill.style.width = (Number(w.average) / 5 * 100) + '%';
        bars.appendChild(el('div', { class: 'bt' }, fill));
        bars.appendChild(el('span', { class: 'bv', text: Number(w.average).toFixed(1) }));
      });
      box.appendChild(bars);
    });
  }

  // ---- table code ----
  var qrDinner = null;
  function tableUrl(d) { return ROOT + '#t=' + d.key + '.' + d.table_code; }
  function openQr(d) {
    qrDinner = d;
    $('qrTitle').textContent = crew.crew.name + ' · Dinner ' + d.n;
    var url = tableUrl(d);
    var q = window.qrcode(0, 'M'); q.addData(url); q.make();
    $('qrImage').innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    $('qrUrl').textContent = url;
    status('qrStatus', '');
    $('qrModal').hidden = false; $('qrClose').focus();
  }
  $('qrCopy').addEventListener('click', function () { copy(tableUrl(qrDinner), 'qrStatus'); });
  $('qrPrint').addEventListener('click', function () { window.print(); });
  $('qrClose').addEventListener('click', function () { $('qrModal').hidden = true; });
  $('qrNew').addEventListener('click', function () {
    if (!confirm('Make a new code? Printed cards and shared links for this dinner stop working.')) return;
    call('new_table_code', { p_dinner: qrDinner.key }).then(function (code) {
      return loadAnchor(true).then(function () { openQr(crew.dinners.filter(function (x) { return x.key === qrDinner.key; })[0]); status('qrStatus', 'New code made. The old one no longer works.'); });
    }, function (e) { status('qrStatus', e.message, true); });
  });

  // ---- date and host ----
  var dateDinner = null;
  function openDate(d) {
    dateDinner = d;
    $('dateTitle').textContent = 'Dinner ' + d.n + ' · ' + d.job;
    var host = $('dHost'); host.textContent = '';
    host.appendChild(el('option', { value: '', text: 'Not set' }));
    crew.men.filter(function (m) { return m.active; }).forEach(function (m) {
      var o = el('option', { value: m.id, text: m.first_name }); if (m.id === d.host_id) o.selected = true; host.appendChild(o);
    });
    if (d.starts_at) { var s = localParts(d.starts_at), e = localParts(d.ends_at); $('dDate').value = s.date; $('dStart').value = s.time; $('dEnd').value = e.time; }
    else { $('dDate').value = ''; $('dStart').value = '18:30'; $('dEnd').value = '20:30'; }
    status('dStatus', '');
    $('dateModal').hidden = false; $('dDate').focus();
  }
  $('dCancel').addEventListener('click', function () { $('dateModal').hidden = true; });
  $('dSave').addEventListener('click', function () {
    var date = $('dDate').value, s = $('dStart').value, e = $('dEnd').value;
    if (!date || !s || !e) { status('dStatus', 'Pick a date and both times.', true); return; }
    var starts = zonedToUtc(date, s, me.tz), ends = zonedToUtc(date, e, me.tz);
    call('save_dinner', { p_dinner: dateDinner.key, p_starts_at: starts, p_ends_at: ends, p_host: $('dHost').value || null }).then(function () {
      $('dateModal').hidden = true; return loadAnchor(true);
    }, function (err) { status('dStatus', err.message, true); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('qrModal').hidden = true; $('dateModal').hidden = true; } });

  // ---- city lead ----
  function loadCity() {
    $('cityName').textContent = me.city_name;
    $('cityMeta').textContent = 'City lead · ' + me.first_name;
    return Promise.all([call('city_summary'), call('city_shared')]).then(function (res) {
      var rows = res[0] || [], shared = res[1] || [];
      var t = $('cityTable'); t.textContent = '';
      t.appendChild(el('thead', null, el('tr', null, el('th', { text: 'Crew' }), el('th', { text: 'Men' }), el('th', { text: 'Dinners' }),
        el('th', { text: 'Check-ins' }), el('th', { text: 'Commitments' }), el('th', { text: 'Kept' }), el('th', { text: 'Last average' }), el('th', { text: 'Top asks' }))));
      var tb = el('tbody');
      rows.forEach(function (c) {
        var asks = (c.asks || []).filter(function (a) { return a.asking > 0; }).sort(function (a, b) { return b.asking - a.asking; }).slice(0, 2)
          .map(function (a) { return a.theme + ' (' + a.asking + ')'; }).join(', ');
        tb.appendChild(el('tr', null, el('td', { text: c.crew }), el('td', { class: 'n', text: String(c.men) }), el('td', { class: 'n', text: String(c.dinners_held) }),
          el('td', { class: 'n', text: String(c.checkins) }), el('td', { class: 'n', text: String(c.commitments) }), el('td', { class: 'n', text: String(c.kept) }),
          el('td', { class: 'n', text: c.last_dinner_average == null ? '·' : Number(c.last_dinner_average).toFixed(1) }), el('td', { text: asks || '·' })));
      });
      t.appendChild(tb);
      var box = $('cityShared'); box.textContent = '';
      if (!shared.length) box.appendChild(el('p', { class: 'small', text: 'Nobody has shared answers with the city lead yet.' }));
      shared.forEach(function (s) {
        var scores = AREAS.filter(function (a) { return s.scores && s.scores[a[0]]; }).map(function (a) { return a[1] + ' ' + s.scores[a[0]]; }).join(' · ');
        var b = el('div', { class: 'answer' }, el('div', { class: 'row between' }, el('h3', { text: s.first_name }), el('span', { class: 'tag', text: s.crew + ' · dinner ' + s.dinner })));
        [['Scores', scores], ['Brought', s.problem ? s.problem + (s.area ? ' (' + areaName(s.area) + ')' : '') : ''], ['Commitment', s.commitment ? s.commitment + (s.by_when ? ' · ' + s.by_when : '') : ''],
          ['Kept', s.kept === true ? 'Yes' : s.kept === false ? 'Not yet' : '']]
          .forEach(function (q) { if (q[1]) b.appendChild(el('div', { class: 'q' }, el('i', { text: q[0] }), q[1])); });
        box.appendChild(b);
      });
      views('city');
    }, function (e) { views('city'); $('cityShared').textContent = e.message; });
  }

  sb.auth.getSession().then(function (r) { if (r.data && r.data.session) start(); else views('signin'); });
})();
