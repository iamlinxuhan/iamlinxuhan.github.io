/* 项目子页面：加载并渲染本地 README。
   相对图片优先使用随站点部署的本地副本，缺失时退回 raw.githubusercontent.com；
   相对文件链接指向 GitHub 文件页，不依赖 GitHub Pages 上的目录结构。 */
(function () {
  'use strict';

  var article = document.getElementById('readme-body');
  if (!article) return;

  var repo = article.getAttribute('data-repo') || '';
  var branch = article.getAttribute('data-branch') || 'main';
  var source = article.getAttribute('data-readme') || 'readme.md';
  var remoteSource = article.getAttribute('data-readme-remote') || 'README.md';
  var assetBase = article.getAttribute('data-asset-base') || '';

  function cleanPath(value) {
    return value.replace(/^\.\//, '').replace(/^\/+/, '');
  }

  function rawUrl(path) {
    return 'https://raw.githubusercontent.com/' + repo + '/' + branch + '/' + path;
  }

  function resolveUrl(value, isImage) {
    if (!value) return value;
    /* 绝对地址、协议相对地址、页内锚点保持原样 */
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return value;
    var path = cleanPath(value);
    if (isImage) {
      /* 图片优先走随站点部署的本地副本，README 截图不依赖 GitHub 的连通性 */
      return assetBase ? assetBase + path : rawUrl(path);
    }
    return 'https://github.com/' + repo + '/blob/' + branch + '/' + path;
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function enhance(root) {
    /* 图片：补全相对路径，徽章不加边框，其余懒加载 */
    Array.prototype.forEach.call(root.querySelectorAll('img'), function (img) {
      var src = img.getAttribute('src');
      if (src) {
        var relative = !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src);
        img.setAttribute('src', resolveUrl(src, true));
        if (relative && assetBase) {
          /* 本地副本缺失时退回 GitHub 原图 */
          var fallback = rawUrl(cleanPath(src));
          img.addEventListener('error', function onError() {
            img.removeEventListener('error', onError);
            img.setAttribute('src', fallback);
          });
        }
        if (/img\.shields\.io|badgen\.net|\/assets\/badges\//.test(src)) {
          img.classList.add('md-badge');
        }
      }
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      if (!img.hasAttribute('alt')) img.setAttribute('alt', '');
    });

    /* 链接：相对文件指向 GitHub，站外链接新窗口打开 */
    Array.prototype.forEach.call(root.querySelectorAll('a'), function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      if (href.charAt(0) === '#') return;
      var next = resolveUrl(href, false);
      link.setAttribute('href', next);
      if (/^https?:/i.test(next)) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });

    /* 同一段里的并排截图：去掉元素间空白，避免 49% + 49% 换行 */
    Array.prototype.forEach.call(
      root.querySelectorAll('p[align="center"], div[align="center"]'),
      function (block) {
        if (block.querySelectorAll('img').length > 1) {
          block.classList.add('md-img-row');
        }
      }
    );

    /* 宽表格单独滚动，避免撑破正文栏 */
    Array.prototype.forEach.call(root.querySelectorAll('table'), function (table) {
      var scroller = document.createElement('div');
      scroller.className = 'md-table';
      table.parentNode.insertBefore(scroller, table);
      scroller.appendChild(table);
    });

    /* 标题 id + 悬停锚点 */
    var used = {};
    Array.prototype.forEach.call(root.querySelectorAll('h1, h2, h3, h4, h5, h6'), function (heading) {
      var base = slugify(heading.textContent) || 'section';
      var id = base;
      if (used[base]) {
        used[base] += 1;
        id = base + '-' + used[base];
      } else {
        used[base] = 1;
      }
      heading.id = id;
      var anchor = document.createElement('a');
      anchor.className = 'md-anchor';
      anchor.href = '#' + id;
      anchor.setAttribute('aria-label', '本节链接');
      anchor.textContent = '#';
      heading.appendChild(anchor);
    });

    /* 代码块复制按钮 */
    Array.prototype.forEach.call(root.querySelectorAll('pre'), function (pre) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'md-copy';
      button.textContent = '复制';
      button.addEventListener('click', function () {
        var code = pre.querySelector('code') || pre;
        var text = code.innerText;
        var reset = function (label) {
          button.textContent = label;
          window.setTimeout(function () { button.textContent = '复制'; }, 1600);
        };
        var fallback = function () {
          var area = document.createElement('textarea');
          area.value = text;
          area.setAttribute('readonly', '');
          area.style.position = 'fixed';
          area.style.top = '-1000px';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          try {
            document.execCommand('copy');
            reset('已复制');
          } catch (e) {
            reset('复制失败');
          }
          document.body.removeChild(area);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            reset('已复制');
          }, fallback);
        } else {
          fallback();
        }
      });
      pre.appendChild(button);
    });
  }

  function render(markdown) {
    if (!window.marked || typeof window.marked.parse !== 'function') {
      throw new Error('marked 未加载');
    }
    article.innerHTML = window.marked.parse(markdown, { gfm: true, breaks: false });
    try {
      enhance(article);
    } catch (error) {
      /* 排版增强失败时保留已渲染的正文 */
      if (window.console && console.error) console.error(error);
    }
    article.setAttribute('aria-busy', 'false');
  }

  function fail(error) {
    article.setAttribute('aria-busy', 'false');
    article.innerHTML =
      '<p class="md-error">README 加载失败，可直接前往 ' +
      '<a href="https://github.com/' + repo + '" target="_blank" rel="noopener noreferrer">GitHub 仓库</a>' +
      ' 查看。</p>';
    if (window.console && console.error) console.error(error);
  }

  if (window.fetch) {
    fetch(source, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(render)
      .catch(function () {
        /* 本地副本不可用时回退到 GitHub 原始文件 */
        return fetch(rawUrl(remoteSource), { mode: 'cors' })
          .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.text();
          })
          .then(render)
          .catch(fail);
      });
  } else {
    fail(new Error('浏览器不支持 fetch'));
  }
})();
