(function () {
  'use strict';
  const S = window.MazeShapes, E = window.MazeEngine, D = window.MazeDocument;
  const $ = selector => document.querySelector(selector), $$ = selector => [...document.querySelectorAll(selector)];
  const STORAGE = 'little-maze-club-v1';
  const iconPaths = {
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    'arrow-right': '<path d="M5 12h14m-5-5 5 5-5 5"/>', 'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>', 'chevron-left': '<path d="m15 6-6 6 6 6"/>', 'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="m6 6 12 12M6 18 18 6"/>', check: '<path d="m5 12 4 4L19 6"/>',
    'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="m8 12 3 3 5-6"/>',
    sliders: '<path d="M4 6h8m4 0h4M4 12h3m4 0h9M4 18h10m4 0h2"/><path d="M12 3v6M7 9v6m7 0v6"/>',
    sparkles: '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3ZM20 2v4m-2-2h4M3 19v3m-1.5-1.5h3"/>',
    shuffle: '<path d="m17 3 4 4-4 4m0 2 4 4-4 4M3 7h3c4 0 8 10 12 10h3M3 17h3c1.7 0 3.4-2.1 5-4.5M13 9c1.7-1.3 3.3-2 5-2h3"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.2 6.3A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.8 5.7"/>',
    file: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 13h8m-8 4h5"/>',
    heart: '<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
    printer: '<path d="M6 9V3h12v6M6 17H4V9h16v8h-2M6 14h12v7H6v-7Z"/><path d="M17 11h.01"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    'layout-one': '<rect x="4" y="3" width="16" height="18" rx="1"/>',
    'layout-two': '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 12h16"/>',
    'layout-four': '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 12h16M12 3v18"/>',
    'layout-six': '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 9h16M4 15h16M12 3v18"/>',
    'line-straight': '<path d="M4 19V6h16"/>',
    'line-rounded': '<path d="M4 19v-8a5 5 0 0 1 5-5h11"/>',
    'line-curved': '<path d="M3 18C9 18 5 5 12 5s3 13 9 13"/>',
    route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h5"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    lightbulb: '<path d="M8 17c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7H8Zm1 3h6M12 3V1M2 5 0 4m22 1 2-1"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    undo: '<path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5"/>',
  };
  function icon(name, className = '') { return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.sparkles}</svg>`; }
  function hydrateIcons(container = document) { container.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
  function seed() {
    if (window.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 4294967296);
  }
  function newItem(shape = 'fish', difficulty = 1, mode = 'classic') { return { id: `maze-${seed().toString(36)}`, shape, difficulty, mode, seed: seed() }; }
  function defaults() {
    return { version: 1, title: '我的迷宫小冒险', perPage: 2, lineStyle: 'curved', minimal: true, ink: true, nameLine: true, answerPages: false,
      items: [newItem('fish'), newItem('elephant', 0, 'story'), newItem('house', 1, 'collect'), newItem('santa', 1, 'story')] };
  }
  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE));
      if (!saved || saved.version !== 1 || !Array.isArray(saved.items) || !saved.items.length) return defaults();
      const items = saved.items.slice(0, 20).filter(item => item && S.byId[item.shape]).map(item => ({
        id: typeof item.id === 'string' && /^maze-[a-z0-9]+$/.test(item.id) ? item.id : `maze-${seed().toString(36)}`,
        shape: item.shape, difficulty: [0, 1, 2, 3].includes(item.difficulty) ? item.difficulty : 1,
        mode: E.MODES.some(m => m.id === item.mode) ? item.mode : 'classic', seed: Number.isFinite(item.seed) ? item.seed >>> 0 : seed(),
      }));
      if (!items.length) return defaults();
      return { version: 1, title: typeof saved.title === 'string' ? saved.title.slice(0, 24) : '我的迷宫小冒险',
        perPage: [1, 2, 4, 6].includes(saved.perPage) ? saved.perPage : 2, lineStyle: window.MazeGeometry.normalizeStyle(saved.lineStyle), minimal: saved.minimal !== false, ink: saved.ink !== false, nameLine: saved.nameLine !== false, answerPages: saved.answerPages === true, items };
    } catch (_) { return defaults(); }
  }
  let state = readState(), selected = 0, page = 0, showAnswer = false, shapeTarget = 0, category = '所有形状', batchDifficulty = 1, exportBusy = false;
  const cache = new Map();
  function save() { try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch (_) { /* Printing also works in private/file browsing. */ } }
  function getMazes() {
    return state.items.map(item => {
      const key = `${item.shape}:${item.difficulty}:${item.seed}`;
      if (!cache.has(key)) {
        // Keep a shared grid: page counts and line styles never change a route.
        const maze = E.generate(item, 4), check = E.validate(maze);
        if (!check.valid) throw new Error(`迷宫检查失败：${check.errors.join('、')}`);
        cache.set(key, maze);
      }
      return { ...cache.get(key), ...item };
    });
  }
  function options() { return { title: state.title, perPage: state.perPage, lineStyle: state.lineStyle, minimal: state.minimal, ink: state.ink, nameLine: state.nameLine }; }
  let toastTimer;
  function toast(message, error = false) {
    const element = $('#toast');
    element.innerHTML = icon(error ? 'lightbulb' : 'check-circle') + `<span>${D.escape(message)}</span>`;
    element.className = `toast visible${error ? ' error' : ''}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { element.classList.remove('visible'); }, error ? 6000 : 3200);
  }
  function renderList() {
    $('#maze-count').value = state.items.length;
    $('#maze-count-label').textContent = String(state.items.length).padStart(2, '0');
    $('[data-action="decrease"]').disabled = state.items.length <= 1;
    $('[data-action="increase"]').disabled = state.items.length >= 20;
    $('#maze-list').innerHTML = state.items.map((item, index) => {
      const shape = S.byId[item.shape], active = selected === index;
      return `<article class="maze-item${active ? ' active' : ''}" data-index="${index}"><div class="maze-item-top"><button type="button" class="shape-thumb" data-action="pick-shape" data-index="${index}" aria-label="为第${index + 1}道迷宫选择形状，当前${shape.name}">${S.thumbnail(item.shape)}</button><button type="button" class="maze-item-summary" data-action="expand" data-index="${index}" aria-expanded="${active}" aria-controls="editor-${index}"><span class="maze-item-name"><span class="item-index">${String(index + 1).padStart(2, '0')}</span>${shape.name}</span><span class="maze-item-meta">${E.DIFFICULTIES[item.difficulty].name}<i class="mini-dot"></i>${E.MODES.find(m => m.id === item.mode).name}</span></button><div class="item-tools"><button type="button" class="icon-button" data-action="refresh-item" data-index="${index}" aria-label="重新生成第${index + 1}道迷宫的路线" title="换一条新路线">${icon('refresh')}</button><button type="button" class="icon-button chevron-button${active ? ' active' : ''}" data-action="expand" data-index="${index}" aria-expanded="${active}" aria-controls="editor-${index}" aria-label="${active ? '收起' : '展开'}第${index + 1}道迷宫设置">${icon('chevron-down')}</button></div></div><div class="maze-item-editor" id="editor-${index}"${active ? '' : ' hidden'}><div class="editor-label-row"><span>难度</span><button type="button" class="text-button" data-action="pick-shape" data-index="${index}">换个形状 ${icon('arrow-up-right')}</button></div><div class="difficulty-options" role="group" aria-label="第${index + 1}道迷宫难度">${E.DIFFICULTIES.map((diff, value) => `<button type="button" data-difficulty="${value}" data-index="${index}" class="${item.difficulty === value ? 'active' : ''}" aria-pressed="${item.difficulty === value}" title="${diff.hint}">${diff.name}</button>`).join('')}</div><div class="mode-field"><label for="mode-${index}">玩法</label><select id="mode-${index}" data-mode="${index}">${E.MODES.map(mode => `<option value="${mode.id}"${item.mode === mode.id ? ' selected' : ''}>${mode.name}</option>`).join('')}</select></div></div></article>`;
    }).join('');
  }
  function currentScene() {
    const mazes = getMazes(), count = Math.ceil(mazes.length / state.perPage);
    page = Math.max(0, Math.min(page, count - 1));
    return D.makeScene(mazes.slice(page * state.perPage, (page + 1) * state.perPage), options(), page, count, showAnswer);
  }
  function renderPreview(animate = false) {
    const scene = currentScene(), count = scene.pageTotal;
    $('#paper-details').hidden = state.minimal;
    $('#paper').innerHTML = D.toSVG(scene, true);
    $('#page-indicator').innerHTML = `第 <strong>${page + 1}</strong> 页 <span>/ ${count}</span>`;
    $('[data-action="prev-page"]').disabled = page === 0;
    $('[data-action="next-page"]').disabled = page >= count - 1;
    const answerCount = state.answerPages ? count : 0;
    $('#print-summary').textContent = `${state.items.length} 道迷宫 · ${count} 张练习纸${answerCount ? ` + ${answerCount} 张答案` : ''} · A4`;
    $$('[data-layout]').forEach(btn => { const active = Number(btn.dataset.layout) === state.perPage; btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', active); });
    $$('[data-line-style]').forEach(btn => { const active = btn.dataset.lineStyle === state.lineStyle; btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', active); });
    $('#show-solution').checked = showAnswer;
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      $('#paper').classList.remove('is-updating');
      requestAnimationFrame(() => $('#paper').classList.add('is-updating'));
    }
  }
  function renderAll(animate = false) { renderList(); renderPreview(animate); save(); }
  function goToItem(index) { page = Math.floor(index / state.perPage); }
  function setCount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) { $('#maze-count').value = state.items.length; return; }
    const count = Math.max(1, Math.min(20, Math.round(parsed)));
    if (count !== parsed) toast('一次可以生成 1～20 道迷宫');
    const original = state.items.length;
    if (count > original) {
      const used = new Set(state.items.map(item => item.shape));
      for (let i = original; i < count; i++) {
        const unused = S.shapes.filter(s => !used.has(s.id)), pool = unused.length ? unused : S.shapes;
        const shape = pool[Math.floor(Math.random() * pool.length)].id; used.add(shape);
        state.items.push(newItem(shape));
      }
    } else state.items = state.items.slice(0, count);
    if (selected >= count) selected = count - 1;
    renderAll(count !== original);
  }
  function randomItems() {
    const pool = [...S.shapes];
    state.items = state.items.map(item => {
      const index = Math.floor(Math.random() * pool.length), shape = pool.splice(index, 1)[0];
      return { ...item, shape: shape.id, difficulty: Math.random() < .35 ? 0 : 1, mode: E.MODES[Math.floor(Math.random() * E.MODES.length)].id, seed: seed() };
    });
    showAnswer = false; page = 0; renderAll(true); toast('新的小伙伴准备好了，一起出发吧！');
  }
  function openDialog(id) { const dialog = document.getElementById(id); if (!dialog.open) dialog.showModal(); }
  function renderShapes() {
    const query = $('#shape-search').value.trim().toLowerCase();
    const filtered = S.shapes.filter(s => (category === '所有形状' || s.category === category) && (!query || `${s.name} ${s.category} ${s.id}`.toLowerCase().includes(query)));
    $('#shape-results-title').textContent = query ? `“${query}”的搜索结果` : category;
    $('#shape-results-count').textContent = `${filtered.length} 种`;
    $('#shape-grid').innerHTML = filtered.length ? filtered.map(s => `<button type="button" class="shape-choice${state.items[shapeTarget]?.shape === s.id ? ' active' : ''}" data-shape="${s.id}" aria-label="选择${s.name}" aria-pressed="${state.items[shapeTarget]?.shape === s.id}">${S.thumbnail(s.id)}<span>${s.name}</span></button>`).join('') : '<p class="shape-empty">还没有找到这个造型。<br>试试“小鱼”“房子”，或者看看其他分类。</p>';
    $('#shape-categories').innerHTML = ['所有形状', ...S.groups].map(group => `<button type="button" class="shape-category${category === group ? ' active' : ''}" data-category="${group}" aria-pressed="${category === group}">${group}<small>${group === '所有形状' ? S.shapes.length : S.shapes.filter(s => s.category === group).length}</small></button>`).join('');
  }
  function pickShape(index) { shapeTarget = index; category = '所有形状'; $('#shape-search').value = ''; renderShapes(); openDialog('shape-dialog'); }
  function applyShape(id) {
    const item = state.items[shapeTarget];
    if (!item || !S.byId[id]) return;
    item.shape = id; selected = shapeTarget; goToItem(shapeTarget);
    $('#shape-dialog').close(); renderAll(true); toast(`第 ${shapeTarget + 1} 道迷宫，变成了${S.byId[id].name}`);
  }
  function renderBatch() {
    $('#batch-difficulties').innerHTML = E.DIFFICULTIES.map((diff, index) => `<button type="button" data-batch-difficulty="${index}" class="${batchDifficulty === index ? 'active' : ''}" aria-pressed="${batchDifficulty === index}">${diff.name}</button>`).join('');
  }
  const filename = () => (state.title || '我的迷宫小冒险').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').slice(0, 40) || '儿童迷宫';
  async function exportPDF() {
    if (exportBusy) return;
    exportBusy = true;
    const button = $('#download-pdf'), original = button.innerHTML;
    button.disabled = true; button.innerHTML = icon('download') + '<span>正在准备…</span>';
    try {
      const name = filename(), scenes = D.makeScenes(getMazes(), options(), state.answerPages);
      const pdf = await D.createPDF(scenes, (done, total) => { button.innerHTML = icon('download') + `<span>导出 ${done}/${total}</span>`; });
      D.download(pdf, `${name}.pdf`); toast(`PDF 已准备好，共 ${scenes.length} 页 A4`);
    } catch (error) { console.error(error); toast(error.message || 'PDF 导出失败，请重试', true); }
    finally { exportBusy = false; button.disabled = false; button.innerHTML = original; }
  }
  async function exportPNG(button) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await D.downloadPNG(currentScene(), `${filename()}${showAnswer ? '-答案' : ''}-第${page + 1}页.png`);
      toast('本页图片已准备好 · 2480 × 3508 像素');
    } catch (error) { console.error(error); toast(error.message || '图片导出失败，请重试', true); }
    finally { button.disabled = false; }
  }
  function preparePrint() {
    const pages = D.makeScenes(getMazes(), options(), state.answerPages);
    $('#print-root').innerHTML = pages.map(scene => `<div class="print-page">${D.toSVG(scene)}</div>`).join('');
  }
  async function print() {
    preparePrint();
    if (document.fonts?.ready) await document.fonts.ready;
    requestAnimationFrame(() => window.print());
  }
  document.addEventListener('click', event => {
    const close = event.target.closest('[data-close]');
    if (close) { document.getElementById(close.dataset.close).close(); return; }
    const layout = event.target.closest('[data-layout]');
    if (layout) { state.perPage = Number(layout.dataset.layout); page = 0; renderPreview(true); save(); return; }
    const lineStyle = event.target.closest('[data-line-style]');
    if (lineStyle) { state.lineStyle = lineStyle.dataset.lineStyle; renderPreview(true); save(); return; }
    const difficulty = event.target.closest('[data-difficulty]');
    if (difficulty) {
      const index = Number(difficulty.dataset.index); state.items[index].difficulty = Number(difficulty.dataset.difficulty); goToItem(index); renderAll(true);
      $(`[data-difficulty="${difficulty.dataset.difficulty}"][data-index="${index}"]`)?.focus({ preventScroll: true }); return;
    }
    const batch = event.target.closest('[data-batch-difficulty]');
    if (batch) { batchDifficulty = Number(batch.dataset.batchDifficulty); renderBatch(); $(`[data-batch-difficulty="${batchDifficulty}"]`)?.focus(); return; }
    const shape = event.target.closest('[data-shape]');
    if (shape) { applyShape(shape.dataset.shape); return; }
    const cat = event.target.closest('[data-category]');
    if (cat) { category = cat.dataset.category; renderShapes(); $(`[data-category="${category}"]`)?.focus({ preventScroll: true }); return; }
    const action = event.target.closest('[data-action]');
    if (!action || action.disabled) return;
    const index = Number(action.dataset.index);
    switch (action.dataset.action) {
      case 'increase': setCount(state.items.length + 1); break;
      case 'decrease': setCount(state.items.length - 1); break;
      case 'expand': selected = selected === index ? -1 : index; renderList(); break;
      case 'pick-shape': pickShape(index); break;
      case 'refresh-item': state.items[index].seed = seed(); goToItem(index); renderAll(true); toast(`第 ${index + 1} 道迷宫，换了一条新路线`); break;
      case 'generate': state.items.forEach(item => { item.seed = seed(); }); showAnswer = false; cache.clear(); renderAll(true); toast('迷宫生成好啦，拿起画笔出发吧！'); break;
      case 'random': randomItems(); break;
      case 'random-shape': applyShape(S.shapes[Math.floor(Math.random() * S.shapes.length)].id); break;
      case 'batch': batchDifficulty = state.items[0].difficulty; $('#batch-mode').value = state.items[0].mode; $('#batch-random-shapes').checked = false; renderBatch(); openDialog('batch-dialog'); break;
      case 'guide': openDialog('guide-dialog'); break;
      case 'prev-page': page--; renderPreview(true); break;
      case 'next-page': page++; renderPreview(true); break;
      case 'pdf': exportPDF(); break;
      case 'png': exportPNG(action); break;
      case 'print': print(); break;
    }
  });
  $('#maze-count').addEventListener('change', event => setCount(event.target.value));
  $('#maze-count').addEventListener('keydown', event => { if (event.key === 'Enter') { setCount(event.target.value); event.target.blur(); } });
  $('#sheet-title').value = state.title;
  $('#sheet-title').addEventListener('input', event => { state.title = event.target.value; renderPreview(); save(); });
  for (const [selector, key] of [['#minimal-mode', 'minimal'], ['#ink-mode', 'ink'], ['#name-line', 'nameLine'], ['#answer-pages', 'answerPages']]) {
    $(selector).checked = state[key];
    $(selector).addEventListener('change', event => { state[key] = event.target.checked; renderPreview(); save(); });
  }
  $('#show-solution').addEventListener('change', event => { showAnswer = event.target.checked; renderPreview(true); });
  document.addEventListener('change', event => {
    if (event.target.matches('[data-mode]')) {
      const index = Number(event.target.dataset.mode); state.items[index].mode = event.target.value; goToItem(index); renderAll(true);
      $(`#mode-${index}`)?.focus({ preventScroll: true });
    }
  });
  $('#shape-search').addEventListener('input', renderShapes);
  $('#batch-form').addEventListener('submit', event => {
    event.preventDefault();
    const pool = [...S.shapes];
    state.items.forEach(item => {
      item.difficulty = batchDifficulty; item.mode = $('#batch-mode').value;
      if ($('#batch-random-shapes').checked) item.shape = pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id;
    });
    $('#batch-dialog').close(); renderAll(true); toast(`已更新全部 ${state.items.length} 道迷宫`);
  });
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
    dialog.addEventListener('close', () => { if (dialog.id === 'shape-dialog') $(`[data-action="pick-shape"][data-index="${shapeTarget}"]`)?.focus({ preventScroll: true }); });
  });
  window.addEventListener('beforeprint', preparePrint);
  hydrateIcons(); renderAll();
})();
