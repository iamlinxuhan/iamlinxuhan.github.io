/* 主题初始化：尽早执行，避免暗色模式闪白。 */
document.documentElement.classList.add('js');
try {
  var savedTheme = localStorage.getItem('theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
} catch (e) {}

/* 页面交互与行星公转模拟。 */
document.addEventListener('DOMContentLoaded', function () {
  (function () {
    var root = document.documentElement;
    var topbar = document.getElementById('topbar');
    var progress = document.getElementById('progress');
    var themeButton = document.getElementById('theme');
    var themeText = themeButton.querySelector('.theme-text');
    var metaTheme = document.querySelector('meta[name="theme-color"]');

    /* 主题 */
    var media = window.matchMedia('(prefers-color-scheme: dark)');

    function applyTheme(mode) {
      var dark = mode === 'dark';
      root.dataset.theme = dark ? 'dark' : 'light';
      themeText.textContent = dark ? '亮色' : '暗色';
      themeButton.setAttribute('aria-label', dark ? '切换到亮色主题' : '切换到暗色主题');
      metaTheme.setAttribute('content', dark ? '#141311' : '#f4f0e7');
    }

    var stored = null;
    try { stored = localStorage.getItem('theme'); } catch (e) {}
    applyTheme(stored || (media.matches ? 'dark' : 'light'));

    themeButton.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', next); } catch (e) {}
      applyTheme(next);
    });

    if (media.addEventListener) {
      media.addEventListener('change', function (event) {
        var saved = null;
        try { saved = localStorage.getItem('theme'); } catch (e) {}
        if (!saved) applyTheme(event.matches ? 'dark' : 'light');
      });
    }

    /* 阅读进度 + 顶栏描边 */
    var ticking = false;
    function onScroll() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progress.style.transform = 'scaleX(' + ratio + ')';
      topbar.classList.toggle('is-scrolled', window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(onScroll);
      }
    }, { passive: true });
    onScroll();

    /* 滚动显现 */
    var reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (el) { revealObserver.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add('is-visible'); });
    }

    /* 左侧章节高亮 */
    var railLinks = Array.prototype.slice.call(document.querySelectorAll('.rail a'));
    if ('IntersectionObserver' in window && railLinks.length) {
      var sectionMap = {};
      railLinks.forEach(function (link) {
        var target = document.querySelector(link.getAttribute('href'));
        if (target) sectionMap[target.id] = link;
      });
      var navObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          railLinks.forEach(function (link) { link.classList.remove('is-active'); });
          var active = sectionMap[entry.target.id];
          if (active) active.classList.add('is-active');
        });
      }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
      Object.keys(sectionMap).forEach(function (id) {
        navObserver.observe(document.getElementById(id));
      });
    }

    /* 行星公转：万有引力提供向心力
       GMm/r² = mω²r  =>  ω = √(GM/r³)
       每颗行星只受中心恒星影响，行星之间不做相互作用。 */
    var planetLayer = document.querySelector('.hero-planets');
    if (planetLayer && window.requestAnimationFrame) {
      var CX = 305;
      var CY = 332;
      var MU = 40000; /* 视觉尺度下的 GM，取一个周期舒服的值 */
      var planetNodes = Array.prototype.slice.call(planetLayer.querySelectorAll('circle'));
      var planetOrbits = planetNodes.map(function (node) {
        var r = parseFloat(node.getAttribute('data-orbit')) || 0;
        return {
          node: node,
          r: r,
          angle: parseFloat(node.getAttribute('data-phase')) || 0,
          omega: r > 0 ? Math.sqrt(MU / (r * r * r)) : 0
        };
      });
      var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      var lastFrame = 0;

      function placePlanet(orbit) {
        var x = CX + orbit.r * Math.cos(orbit.angle);
        var y = CY + orbit.r * Math.sin(orbit.angle);
        orbit.node.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
      }

      planetOrbits.forEach(placePlanet);

      function orbitFrame(now) {
        if (!lastFrame) lastFrame = now;
        var dt = Math.min((now - lastFrame) / 1000, 0.05);
        lastFrame = now;
        if (!reducedMotion.matches) {
          planetOrbits.forEach(function (orbit) {
            orbit.angle = (orbit.angle + orbit.omega * dt) % (Math.PI * 2);
            placePlanet(orbit);
          });
        }
        window.requestAnimationFrame(orbitFrame);
      }

      window.requestAnimationFrame(orbitFrame);
    }

    /* 年份 */
    var year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
  })();
});
