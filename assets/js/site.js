/* VCT FAN — site.js (design system v2)
   Progressive enhancement only: every piece of content is readable without JS.
   - header: .is-scrolled after scrolling
   - subnav: scroll the current item of .subnav-list into view (mobile)
   - menu:   <details class="menu"> → animated overlay, focus trap, Esc, scroll lock
   - reveal: .rv gets .in when it enters the viewport
   - count:  [data-count] numbers count up once visible
   - more:   <details class="more"> / <details class="acc"> open/close height animation
   - readmore: .readmore → 2-line clamp + MORE button (only if text overflows)
   - tabs:   .tabs (anchor links → ARIA tabs)
   - filter: .chips[data-filter-group] buttons filter [data-filter-key] items ([data-filter-scope] hides when empty)
   - history: sticky year nav marks the current year; .tl2 line grows with scroll (--p)
   All animation is skipped under prefers-reduced-motion. */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- header ---------- */
  var head = document.querySelector('.site-head');
  if (head) {
    var onScroll = function () { head.classList.toggle('is-scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- tab bar: hide while scrolling down, show on scroll up ---------- */
  if (doc.classList.contains('has-tabbar')) {
    var lastY = window.scrollY, tbTick = false;
    window.addEventListener('scroll', function () {
      if (tbTick) return;
      tbTick = true;
      requestAnimationFrame(function () {
        var y = window.scrollY, dy = y - lastY;
        var nearBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 80;
        if (y < 80 || dy < -6 || nearBottom) doc.classList.remove('tabbar-hide');
        else if (dy > 6) doc.classList.add('tabbar-hide');
        if (Math.abs(dy) > 6) lastY = y;
        tbTick = false;
      });
    }, { passive: true });
  }

  /* ---------- sub-nav: keep the current page visible in the horizontal list ---------- */
  var subList = document.querySelector('.subnav-list');
  if (subList) {
    var curItem = subList.querySelector('.subnav-leaf') || subList.querySelector('.is-cur');
    if (curItem && subList.scrollWidth > subList.clientWidth) {
      var li = curItem.closest('li') || curItem;
      var left = li.offsetLeft - subList.offsetLeft;
      var target = left + li.offsetWidth - subList.clientWidth + 32;
      subList.scrollLeft = Math.max(0, Math.min(left - 8, target > 0 ? target : 0));
    }
  }

  /* ---------- menu ---------- */
  var menu = document.querySelector('.menu');
  if (menu) {
    var btn = menu.querySelector('.menu-btn');
    var panel = menu.querySelector('.menu-panel');
    var lastFocus = null;
    var closeTimer = null;
    var focusables = function () {
      return [btn].concat($$('a[href], button:not([disabled])', panel)).filter(function (el) { return el.offsetParent !== null || el === btn; });
    };
    var open = function () {
      clearTimeout(closeTimer);
      lastFocus = document.activeElement;
      menu.open = true;
      btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-lock');
      requestAnimationFrame(function () { requestAnimationFrame(function () { menu.classList.add('is-open'); }); });
      // site map: bring "YOU ARE HERE" into view if it is below the fold
      var here = panel.querySelector('.map-item.is-here');
      if (here) {
        var r = here.getBoundingClientRect();
        if (r.bottom > window.innerHeight - 24) panel.scrollTop += r.top - window.innerHeight * 0.4;
      }
      var first = panel.querySelector('a[href]');
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, reduce ? 0 : 120);
    };
    var close = function (restore) {
      menu.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-lock');
      closeTimer = setTimeout(function () { menu.open = false; }, reduce ? 0 : 340);
      if (restore !== false) btn.focus({ preventScroll: true });
    };
    btn.setAttribute('aria-expanded', menu.open ? 'true' : 'false');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (menu.classList.contains('is-open')) close(); else open();
    });
    document.addEventListener('keydown', function (e) {
      if (!menu.classList.contains('is-open')) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        var f = focusables();
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    $$('a', panel).forEach(function (a) {
      a.addEventListener('click', function () { close(false); });
    });
  }

  /* ---------- scroll reveal ---------- */
  var rv = $$('.rv');
  if (reduce || !('IntersectionObserver' in window)) {
    rv.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    rv.forEach(function (el) { io.observe(el); });
  }

  /* ---------- count-up ---------- */
  var counters = $$('[data-count]');
  var runCount = function (el) {
    var to = parseFloat(el.getAttribute('data-count'));
    if (isNaN(to) || reduce) return;
    var dur = 1400, t0 = null;
    var fmt = function (v) { return Math.round(v).toLocaleString('en-US'); };
    var step = function (t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  };
  if (counters.length && !reduce && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { runCount(e.target); cio.unobserve(e.target); } });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------- MORE + (details height animation) ---------- */
  $$('details.more, details.acc, details.ev-row').forEach(function (d) {
    var sum = d.querySelector('summary');
    var body = d.querySelector('.more-body');
    if (!sum || !body || reduce || !body.animate) return;
    var anim = null;
    sum.addEventListener('click', function (e) {
      e.preventDefault();
      if (anim) anim.cancel();
      if (!d.open) {
        d.open = true;
        var h = body.scrollHeight;
        anim = body.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.75,.2,1)' });
        anim.onfinish = function () { anim = null; };
      } else {
        var h2 = body.scrollHeight;
        anim = body.animate([{ height: h2 + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.4,0,.2,1)' });
        anim.onfinish = function () { d.open = false; anim = null; };
      }
    });
  });

  /* ---------- readmore (2-line clamp) ---------- */
  $$('.readmore').forEach(function (r) {
    var text = r.querySelector('.readmore-text');
    var b = r.querySelector('.readmore-btn');
    if (!text || !b) return;
    text.classList.add('is-clamped');
    var check = function () {
      if (!text.classList.contains('is-clamped')) return;
      r.classList.toggle('has-more', text.scrollHeight > text.clientHeight + 2);
    };
    check();
    window.addEventListener('resize', check);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(check);
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', function () {
      var clamped = text.classList.toggle('is-clamped');
      b.setAttribute('aria-expanded', clamped ? 'false' : 'true');
      b.textContent = clamped ? 'MORE +' : 'CLOSE −';
    });
  });

  /* ---------- tabs ---------- */
  $$('.tabs').forEach(function (box) {
    var list = box.querySelector('.tab-list');
    var tabs = $$('.tab', list);
    var panels = tabs.map(function (t) { return document.getElementById((t.getAttribute('href') || '').slice(1)); });
    if (!list || panels.some(function (p) { return !p; })) return;
    list.setAttribute('role', 'tablist');
    tabs.forEach(function (t, i) {
      t.setAttribute('role', 'tab');
      t.id = t.id || 'tab-' + panels[i].id;
      t.setAttribute('aria-controls', panels[i].id);
      panels[i].setAttribute('role', 'tabpanel');
      panels[i].setAttribute('aria-labelledby', t.id);
      panels[i].tabIndex = 0;
    });
    var select = function (i, focus, push) {
      tabs.forEach(function (t, j) {
        var on = i === j;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
      });
      $$('.rv', panels[i]).forEach(function (el) { el.classList.add('in'); });
      window.dispatchEvent(new Event('resize'));
      if (focus) tabs[i].focus();
      if (push && history.replaceState) history.replaceState(null, '', '#' + panels[i].id);
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function (e) { e.preventDefault(); select(i, false, true); });
      t.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') n = 0;
        if (e.key === 'End') n = tabs.length - 1;
        if (n !== null) { e.preventDefault(); select(n, true, true); }
      });
    });
    var start = panels.findIndex(function (p) { return '#' + p.id === location.hash; });
    box.classList.add('is-ready');
    select(start >= 0 ? start : 0, false, false);
  });

  /* ---------- filter chips ---------- */
  $$('[data-filter-group]').forEach(function (group) {
    var target = document.getElementById(group.getAttribute('data-filter-group'));
    if (!target) return;
    group.hidden = false;
    var chips = $$('.chip', group);
    var items = $$('[data-filter-key]', target);
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        var v = c.getAttribute('data-filter') || '';
        chips.forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
        items.forEach(function (it) {
          var show = !v || it.getAttribute('data-filter-key') === v;
          it.hidden = !show;
          if (show) it.classList.add('in');
        });
        // containers marked [data-filter-scope] (e.g. a year on the history page) hide when nothing in them is left
        $$('[data-filter-scope]', target).forEach(function (sc) {
          sc.hidden = !sc.querySelector('[data-filter-key]:not([hidden])');
          if (!sc.hidden) $$('.rv', sc).forEach(function (el) { el.classList.add('in'); });
        });
        window.dispatchEvent(new Event('scroll'));
      });
    });
  });
  /* ---------- history timeline: current year in the sticky year nav + line that grows with scroll ---------- */
  var ynav = document.querySelector('.ynav');
  var tl2 = document.querySelector('.tl2');
  if (ynav || tl2) {
    var ylinks = ynav ? $$('.ynav-a', ynav) : [];
    var ylist = ynav ? ynav.querySelector('.ynav-list') : null;
    var years = $$('.tl2 .yr');
    var curY = null, hTick = false;
    var setYear = function (id) {
      if (id === curY) return;
      curY = id;
      var on = null;
      ylinks.forEach(function (a) {
        var hit = a.getAttribute('href') === '#' + id;
        if (hit) { a.setAttribute('aria-current', 'true'); on = a; } else a.removeAttribute('aria-current');
      });
      if (on && ylist && ylist.scrollWidth > ylist.clientWidth) {
        var l = on.parentNode.offsetLeft - ylist.offsetLeft;
        var to = Math.max(0, l - (ylist.clientWidth - on.offsetWidth) / 2);
        if (ylist.scrollTo) ylist.scrollTo({ left: to, behavior: reduce ? 'auto' : 'smooth' }); else ylist.scrollLeft = to;
      }
    };
    var histUpdate = function () {
      hTick = false;
      var vh = window.innerHeight;
      var id = null;
      years.forEach(function (y) { if (!y.hidden && y.getBoundingClientRect().top <= vh * 0.38) id = y.id; });
      setYear(id);
      if (tl2 && !reduce) {
        var r = tl2.getBoundingClientRect();
        var p = r.height > 0 ? (vh * 0.62 - r.top) / r.height : 1;
        tl2.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(4));
      }
    };
    window.addEventListener('scroll', function () { if (!hTick) { hTick = true; requestAnimationFrame(histUpdate); } }, { passive: true });
    window.addEventListener('resize', histUpdate);
    histUpdate();
  }
})();
