/* Only opaque, revocable app sessions reach this client. No service keys. */
(() => {
  'use strict';
  const backend = window.FIRE_CONFIG.backend;
  const root = new URL('./', location.href);
  const key = 'fire-h5:' + root.pathname + ':session-v1';
  const app = document.getElementById('app');
  const notice = document.getElementById('connection-status');
  let session = '';
  try { session = sessionStorage.getItem(key) || ''; } catch (_) { /* In-memory fallback. */ }
  let generation = 0, submitting = false;
  let objects = [];
  const remember = value => {
    session = value;
    try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch (_) { /* In-memory fallback. */ }
  };
  function route(value = location.hash.slice(1) || '/') {
    const url = new URL(value, backend);
    if (url.origin !== new URL(backend).origin || !url.pathname.startsWith('/') || url.pathname.startsWith('//') || url.pathname.includes('\\')) throw new Error('页面地址无效。');
    return url.pathname + url.search;
  }
  function notify(text) { notice.textContent = text; notice.hidden = !text; }
  async function request(path, options = {}, retry = true) {
    const headers = new Headers(options.headers);
    const sentSession = session;
    const requestedGeneration = generation;
    if (session) headers.set('X-Fire-Session', session);
    let response;
    try {
      response = await fetch(backend + '/api/pages' + route(path), {...options, headers, credentials: 'omit', redirect: 'error', cache: 'no-store'});
    } catch (_) { throw new Error('暂时无法连接活动服务，请稍后重试。'); }
    // A late anonymous GET must never overwrite a newly authenticated session.
    if (generation === requestedGeneration && session === sentSession && response.headers.has('X-Fire-Session')) remember(response.headers.get('X-Fire-Session'));
    if (response.status === 401) {
      if (generation !== requestedGeneration) throw new Error('页面已切换。');
      if (session === sentSession) remember('');
      if (retry && (!options.method || options.method === 'GET')) return request(path, options, false);
      throw new Error('登录已失效，请重新登录后提交。');
    }
    return response;
  }
  function internal(value, base) {
    const url = new URL(value, backend + base);
    return url.origin === new URL(backend).origin ? url : null;
  }
  function asset(value) {
    const url = new URL(value, backend);
    const name = url.pathname.slice(8);
    return url.pathname.startsWith('/static/') ? new URL('assets/' + (window.FIRE_CONFIG.assets[name] || name) + url.hash, root).href : null;
  }
  async function privateImage(img, path, version) {
    try {
      const response = await request(path);
      if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) throw new Error();
      const blob = URL.createObjectURL(await response.blob());
      if (version !== generation) { URL.revokeObjectURL(blob); return; }
      objects.push(blob); img.src = blob;
      if (img.parentElement?.tagName === 'A') img.parentElement.href = blob;
    } catch (_) {
      if (version === generation) { img.alt = '照片暂时无法加载，请刷新重试'; img.classList.add('pages-proof-error'); }
    }
  }
  function render(html, path, version) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,base,iframe,object,embed,meta').forEach(node => node.remove());
    doc.body.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attr => {
        if (/^on/i.test(attr.name) || attr.name === 'srcdoc') node.removeAttribute(attr.name);
      });
    });
    doc.body.querySelectorAll('[src],[href],form').forEach(node => {
      for (const attr of ['src', 'href']) {
        const value = node.getAttribute(attr);
        if (!value) continue;
        if (/^\s*javascript:/i.test(value)) { node.removeAttribute(attr); continue; }
        const mapped = asset(value);
        if (mapped) { node.setAttribute(attr, mapped); continue; }
        if (attr === 'href' && value === '#main-content') continue;
        const url = internal(value, path);
        if (attr === 'href' && url && !url.pathname.startsWith('/evidence/')) {
          node.setAttribute(attr, '#' + url.pathname + url.search);
          node.removeAttribute('target');
        }
        if (attr === 'src' && url?.pathname.startsWith('/evidence/')) {
          node.removeAttribute('src'); node.dataset.privateImage = url.pathname;
          if (node.parentElement?.tagName === 'A') node.parentElement.removeAttribute('href');
        }
      }
      if (node.tagName === 'FORM') {
        node.dataset.route = route(node.getAttribute('action') || path);
        node.removeAttribute('action');
      }
    });
    objects.forEach(URL.revokeObjectURL); objects = [];
    document.title = doc.title || '龙岗消防公益';
    document.body.className = doc.body.className;
    app.replaceChildren(...doc.body.childNodes);
    window.initFirePage();
    app.querySelectorAll('[data-private-image]').forEach(img => privateImage(img, img.dataset.privateImage, version));
    app.setAttribute('aria-busy', 'false');
    window.scrollTo(0, 0);
    app.querySelector('#main-content')?.focus({preventScroll: true});
  }
  async function receive(response, path, version, hops = 0) {
    if (generation !== version) return;
    if (response.headers.get('Content-Type')?.includes('application/json')) {
      const data = await response.json();
      if (generation !== version) return;
      if (data.redirect) {
        if (hops > 5) throw new Error('页面跳转异常，请重新进入。');
        const next = route(data.redirect);
        history.replaceState(null, '', '#' + next);
        return receive(await request(next), next, version, hops + 1);
      }
      if (data.html) { render(data.html, path, version); return; }
      throw new Error(data.error || '服务暂时不可用，请稍后重试。');
    }
    if (response.ok && response.headers.get('Content-Type')?.includes('text/csv')) {
      const blob = URL.createObjectURL(await response.blob());
      const a = document.createElement('a'); a.href = blob; a.download = '消防公益活动导出.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(blob), 60000); return;
    }
    throw new Error((response.status === 429 ? '操作较频繁，请15分钟后再试。' : response.status === 413 ? '上传内容过大，请压缩照片后重试。' : '服务暂时繁忙，请稍后重试。'));
  }
  async function load() {
    if (submitting) return;
    const version = ++generation;
    notify(''); app.setAttribute('aria-busy', 'true');
    try { const path = route(); await receive(await request(path), path, version); }
    catch (error) {
      if (generation === version) {
        notify(error.message);
        if (!app.querySelector('form')) {
          const main = document.createElement('main'); main.className = 'pages-loading';
          const text = document.createElement('p'); text.textContent = error.message;
          const button = document.createElement('button'); button.textContent = '重新加载'; button.addEventListener('click', load);
          main.append(text, button); app.replaceChildren(main);
        }
      }
    } finally { if (generation === version) app.setAttribute('aria-busy', 'false'); }
  }
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!app.contains(form)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (submitting) return;
    const data = new FormData(form, event.submitter);
    const path = form.dataset.route;
    if (form.method.toLowerCase() === 'get') {
      const url = new URL(path, backend); url.search = new URLSearchParams(data).toString();
      const next = url.pathname + url.search;
      if (location.hash === '#' + next) load(); else location.hash = next;
      return;
    }
    submitting = true; notify('正在提交…');
    const buttons = [...form.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
    form.setAttribute('aria-busy', 'true');
    const version = ++generation;
    try { await receive(await request(path, {method: 'POST', body: data, headers: {'X-CSRFToken': data.get('csrfmiddlewaretoken') || ''}}), path, version); notify(''); }
    catch (error) { notify(error.message); }
    finally { submitting = false; buttons.forEach(b => b.disabled = false); form.removeAttribute('aria-busy'); }
  }, true);
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (link?.getAttribute('href') === '#main-content') {
      event.preventDefault(); app.querySelector('#main-content')?.focus(); return;
    }
    if (!link || !app.contains(link) || !link.getAttribute('href').startsWith('#/')) return;
    if (submitting) { event.preventDefault(); return; }
    if (link.hash === location.hash && !event.ctrlKey && !event.metaKey) { event.preventDefault(); load(); }
  });
  window.addEventListener('hashchange', load);
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  load();
})();
