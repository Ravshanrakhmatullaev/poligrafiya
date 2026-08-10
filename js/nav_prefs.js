// nav_prefs.js — per-user drag-drop ordering for the main nav + calculator tabs.
// Self-contained: does NOT edit app.js/auth.js (which carry unrelated Price work).
// Persistence: erp_user_prefs (per-user RLS) with localStorage fallback so the
// feature degrades gracefully if the table/migration is not applied yet.
//
// Business rules:
//  - Order is USER-SPECIFIC (keyed by auth user id); never shared between users.
//  - Unknown/new tabs added later always appear (appended after saved ones).
//  - "Standart tartibga qaytarish" resets to the captured default order.
//  - Xabarlar MAIN-NAV entry is hidden (bell + panel + tables stay intact).
(function () {
  'use strict';

  var NAV = { container: '#main-nav', item: '.nav-btn', key: function (el) { return el.id; }, field: 'nav_order' };
  var CALC = { container: '.kc-tabs', item: '.kc-tab', key: function (el) { return el.dataset.type; }, field: 'calc_order' };
  var defaults = { nav_order: null, calc_order: null }; // captured default order (source for reset/reconcile)

  // ---- helpers ----
  function $(sel) { return document.querySelector(sel); }
  function items(cfg) {
    var c = $(cfg.container); if (!c) return [];
    return Array.prototype.filter.call(c.querySelectorAll(cfg.item), function (el) {
      return !el.hasAttribute('data-noreorder');
    });
  }
  function currentOrder(cfg) { return items(cfg).map(cfg.key); }

  // PURE: merge a saved order onto the set of keys that currently exist.
  // Saved order wins for known keys; unknown/new keys keep their current relative
  // order and are appended at the end (never lost). Stale saved keys are dropped.
  function reconcile(currentKeys, savedOrder) {
    if (!savedOrder || !savedOrder.length) return currentKeys.slice();
    var exists = {}; currentKeys.forEach(function (k) { exists[k] = 1; });
    var out = [], used = {};
    savedOrder.forEach(function (k) { if (exists[k] && !used[k]) { out.push(k); used[k] = 1; } });
    currentKeys.forEach(function (k) { if (!used[k]) { out.push(k); used[k] = 1; } });
    return out;
  }

  // Reorder DOM children to the reconciled order. Reset controls (data-noreorder)
  // are re-appended last.
  function applyOrder(cfg, savedOrder) {
    var c = $(cfg.container); if (!c || !savedOrder) return;
    var byKey = {}; var cur = [];
    items(cfg).forEach(function (el) { var k = cfg.key(el); byKey[k] = el; cur.push(k); });
    reconcile(cur, savedOrder).forEach(function (k) { if (byKey[k]) c.appendChild(byKey[k]); });
    Array.prototype.forEach.call(c.querySelectorAll('[data-noreorder]'), function (el) { c.appendChild(el); });
  }

  // ---- persistence (per-user) ----
  function uid() { return (typeof currentUser !== 'undefined' && currentUser && currentUser.id) || null; }
  function lsKey(id) { return 'erp_nav_prefs_' + id; }
  function readLocal(id) { try { return JSON.parse(localStorage.getItem(lsKey(id)) || '{}'); } catch (e) { return {}; } }
  function writeLocal(id, obj) { try { localStorage.setItem(lsKey(id), JSON.stringify(obj)); } catch (e) {} }

  var saveTimer = null;
  function savePrefs(patch) {
    var id = uid(); if (!id) return;
    var merged = readLocal(id); for (var k in patch) merged[k] = patch[k];
    writeLocal(id, merged); // instant, offline-safe source of truth
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (typeof sb === 'undefined' || !sb.from) return;
      try {
        sb.from('erp_user_prefs')
          .upsert({ user_id: id, nav_order: merged.nav_order || null, calc_order: merged.calc_order || null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
          .then(function () {}, function () {}); // table absent / offline -> localStorage stays
      } catch (e) {}
    }, 400);
  }

  function applyPrefs(p) {
    if (!p) return;
    if (p.nav_order) applyOrder(NAV, p.nav_order);
    if (p.calc_order) applyOrder(CALC, p.calc_order);
  }

  function loadPrefs() {
    var id = uid(); if (!id) return;
    applyPrefs(readLocal(id)); // instant from cache
    if (typeof sb === 'undefined' || !sb.from) return;
    try {
      sb.from('erp_user_prefs').select('nav_order,calc_order').eq('user_id', id).maybeSingle()
        .then(function (res) {
          if (res && res.data) {
            var d = { nav_order: res.data.nav_order, calc_order: res.data.calc_order };
            writeLocal(id, Object.assign(readLocal(id), d));
            applyPrefs(d);
          }
        }, function () {}); // table missing -> keep localStorage
    } catch (e) {}
  }

  // ---- pointer-based drag reorder (works on touch + mouse) ----
  function makeReorderable(cfg, onReorder) {
    var c = $(cfg.container); if (!c) return;
    var dragEl = null, startX = 0, startY = 0, moved = false, pid = null;

    function siblings() { return items(cfg); }

    function onDown(e) {
      var el = e.target.closest(cfg.item);
      if (!el || el.hasAttribute('data-noreorder') || !c.contains(el)) return;
      dragEl = el; moved = false; pid = e.pointerId;
      startX = e.clientX; startY = e.clientY;
    }
    function onMove(e) {
      if (!dragEl || e.pointerId !== pid) return;
      if (!moved) {
        if (Math.abs(e.clientX - startX) < 6 && Math.abs(e.clientY - startY) < 6) return;
        moved = true;
        try { dragEl.setPointerCapture(pid); } catch (x) {}
        dragEl.style.opacity = '0.6';
        dragEl.classList.add('reorder-dragging');
      }
      // horizontal insertion: place before first sibling whose midpoint is right of pointer
      var sibs = siblings();
      var before = null;
      for (var i = 0; i < sibs.length; i++) {
        if (sibs[i] === dragEl) continue;
        var r = sibs[i].getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) { before = sibs[i]; break; }
      }
      if (before && before !== dragEl) c.insertBefore(dragEl, before);
      else if (!before) { // move to end (before any reset control)
        var reset = c.querySelector('[data-noreorder]');
        c.insertBefore(dragEl, reset || null);
      }
      e.preventDefault();
    }
    function onUp(e) {
      if (!dragEl || e.pointerId !== pid) return;
      var wasMoved = moved;
      dragEl.style.opacity = '';
      dragEl.classList.remove('reorder-dragging');
      try { dragEl.releasePointerCapture(pid); } catch (x) {}
      dragEl = null; pid = null;
      if (wasMoved) {
        // swallow the click that follows a drag so we don't switch panel/tab
        var swallow = function (ev) { ev.stopPropagation(); ev.preventDefault(); c.removeEventListener('click', swallow, true); };
        c.addEventListener('click', swallow, true);
        setTimeout(function () { c.removeEventListener('click', swallow, true); }, 50);
        onReorder(currentOrder(cfg));
      }
    }
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.style.touchAction = 'pan-y'; // allow vertical scroll, capture horizontal drag
  }

  // ---- reset controls ("Standart tartibga qaytarish") ----
  function resetOrder(cfg) {
    savePrefs((function () { var o = {}; o[cfg.field] = null; return o; })());
    if (defaults[cfg.field]) applyOrder(cfg, defaults[cfg.field]);
    if (typeof showNotify === 'function') showNotify('Standart tartib tiklandi');
  }
  function injectReset(cfg, label) {
    var c = $(cfg.container); if (!c || c.querySelector('[data-noreorder]')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('data-noreorder', '1');
    b.title = 'Standart tartibga qaytarish';
    b.className = (cfg === NAV ? 'nav-btn' : 'kc-tab') + ' reorder-reset';
    b.style.opacity = '0.6';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' + (label || '');
    b.onclick = function (e) { e.stopPropagation(); resetOrder(cfg); };
    c.appendChild(b);
  }

  // ---- durable Xabarlar main-nav hide (bell + panel + tables untouched) ----
  function hideXabarlarNav() {
    if (document.getElementById('nav-prefs-style')) return;
    var st = document.createElement('style');
    st.id = 'nav-prefs-style';
    st.textContent = '#nb-xabarlar{display:none !important}' +
      '.reorder-dragging{cursor:grabbing}' + $sel();
    (document.head || document.documentElement).appendChild(st);
  }
  function $sel() { return NAV.item + ',' + CALC.item + '{cursor:grab}'; }

  // ---- init ----
  function init() {
    hideXabarlarNav();
    defaults.nav_order = currentOrder(NAV);
    defaults.calc_order = currentOrder(CALC);
    injectReset(NAV, '');
    injectReset(CALC, '');
    makeReorderable(NAV, function (order) { savePrefs({ nav_order: order }); });
    makeReorderable(CALC, function (order) { savePrefs({ calc_order: order }); });
    // apply any already-known (cached) prefs immediately, then refresh from DB
    loadPrefs();
    // re-load on auth changes (login on this or another device)
    try {
      if (typeof sb !== 'undefined' && sb.auth && sb.auth.onAuthStateChange) {
        sb.auth.onAuthStateChange(function (_e, session) { if (session) loadPrefs(); });
      }
    } catch (e) {}
  }

  // Node (test) vs browser: export pure helpers for unit tests, skip auto-init when
  // there is no DOM. Browser behaviour is unchanged (document always exists there).
  if (typeof module !== 'undefined' && module.exports && typeof document === 'undefined') {
    module.exports = { reconcile: reconcile };
    return;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // expose reset for optional external triggers
  window.resetNavOrder = function () { resetOrder(NAV); };
  window.resetCalcOrder = function () { resetOrder(CALC); };
})();
