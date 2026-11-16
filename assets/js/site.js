/* VCT ファンガイド 共通JS(非公式ファンサイト)
   - スクロール進捗バー
   - スクロールで表示(.rv / .gx / .gy)
   - 地域タブ(teams/index.html)
   JSが無効でも内容はすべて読めます。 */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 進捗バー */
  var prog = document.querySelector('.prog');
  if (prog) {
    var ticking = false;
    var update = function () {
      var max = doc.scrollHeight - window.innerHeight;
      var r = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      prog.style.transform = 'scaleX(' + r.toFixed(4) + ')';
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* スクロール表示 */
  var targets = document.querySelectorAll('.rv, .gx, .gy');
  if (reduce || !('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    targets.forEach(function (el) { io.observe(el); });
  }

  /* 地域タブ */
  var tablist = document.querySelector('[role="tablist"]');
  if (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    var select = function (tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
      // 新しく表示したパネル内の要素も見えるようにする
      var panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.querySelectorAll('.rv').forEach(function (el) { el.classList.add('in'); });
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () {
        select(t, false);
        if (history.replaceState) history.replaceState(null, '', '#' + t.id.replace(/^tab-/, ''));
      });
      t.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
        if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === 'Home') n = tabs[0];
        if (e.key === 'End') n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); select(n, true); }
      });
    });
    var fromHash = document.getElementById('tab-' + (location.hash || '').slice(1));
    if (fromHash && tabs.indexOf(fromHash) >= 0) select(fromHash, false);
  }

  /* スマホ用メニュー(<details>)：外側クリック・Esc・リンクで閉じる */
  var mnav = document.querySelector('.mnav');
  if (mnav) {
    document.addEventListener('click', function (e) {
      if (mnav.open && !mnav.contains(e.target)) mnav.open = false;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mnav.open) { mnav.open = false; mnav.querySelector('summary').focus(); }
    });
    mnav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { mnav.open = false; });
    });
  }

  /* ニュースのカテゴリ絞り込み(JSなしではすべて表示) */
  var chips = document.querySelectorAll('.fchip');
  var nlist = document.querySelector('[data-filter-list]');
  if (chips.length && nlist) {
    var cards = Array.prototype.slice.call(nlist.querySelectorAll('.ncard'));
    var count = document.querySelector('.fcount');
    var apply = function (cat) {
      var n = 0;
      cards.forEach(function (c) {
        var show = !cat || c.getAttribute('data-cat') === cat;
        c.hidden = !show;
        if (c.parentElement && c.parentElement !== nlist) c.parentElement.hidden = !show;
        if (show) { n++; c.classList.add('in'); }
      });
      chips.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cat') === cat ? 'true' : 'false'); });
      if (count) count.textContent = (cat ? '「' + cat + '」' : 'すべて') + '：' + n + '件';
    };
    chips.forEach(function (b) {
      b.addEventListener('click', function () { apply(b.getAttribute('data-cat') || ''); });
    });
  }
})();
