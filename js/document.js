(function (root) {
  'use strict';
  const Shapes = root.MazeShapes || (typeof require === 'function' ? require('./shapes.js') : null);
  const Engine = root.MazeEngine || (typeof require === 'function' ? require('./maze.js') : null);
  const Geometry = root.MazeGeometry || (typeof require === 'function' ? require('./geometry.js') : null);
  const PAGE = { width: 210, height: 297 };
  const n = value => Number(value.toFixed(3));
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const path = (scene, d, stroke = '#292f2b', width = .3, fill = 'none', dash) => scene.elements.push({ type: 'path', d, stroke, width, fill, dash });
  const text = (scene, value, x, y, size, color = '#292f2b', weight = 400, anchor = 'start') => scene.elements.push({ type: 'text', value, x, y, size, color, weight, anchor });
  const circle = (scene, x, y, radius, fill, stroke = 'none', width = .25) => scene.elements.push({ type: 'circle', x, y, radius, fill, stroke, width });
  const line = (scene, x1, y1, x2, y2, color = '#dde0d9', width = .22, dash) => path(scene, `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, color, width, 'none', dash);
  function starPath(x, y, radius) {
    return Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? radius * .46 : radius;
      return `${i ? 'L' : 'M'}${n(x + Math.cos(angle) * r)} ${n(y + Math.sin(angle) * r)}`;
    }).join('') + 'Z';
  }
  function drawMaze(scene, maze, box, options = {}) {
    const minimal = options.minimal !== false;
    const style = Geometry.normalizeStyle(options.lineStyle), padding = minimal ? (maze.topology ? .65 : 1.05) : 1.2;
    const transform = Geometry.projection(maze, box, padding, style), { scale } = transform;
    const gridXY = cell => maze.topology ? maze.centers[cell] : [cell % maze.cols + .5, Math.floor(cell / maze.cols) + .5];
    const xy = cell => transform.point(gridXY(cell));
    const startPoint = gridXY(maze.start.cell), endPoint = gridXY(maze.end.cell);
    const startOuterGrid = maze.topology ? maze.start.outerPoint : [startPoint[0] - 1.25, startPoint[1]];
    const endOuterGrid = maze.topology ? maze.end.outerPoint : [endPoint[0] + 1.25, endPoint[1]];
    const startOuter = transform.point(startOuterGrid), endOuter = transform.point(endOuterGrid);
    if (options.answer) {
      const points = [startOuterGrid, ...maze.solution.map(gridXY), endOuterGrid];
      const commands = maze.topology ? maze.answerCommands : Geometry.roundedPolyline(points, style === 'straight' ? 0 : .22);
      path(scene, Geometry.project(commands, transform), options.ink ? '#9a9a9a' : '#96b59a', Math.min(1.2, scale * .21));
    }
    const wallPath = Geometry.project(maze.topology ? maze.wallCommands : Geometry.wallCommands(maze.walls, style), transform);
    path(scene, wallPath, '#272d29', Math.max(.24, Math.min(.42, scale * .072)));
    if (maze.mode === 'collect') for (const cell of maze.stars) {
      const [x, y] = xy(cell);
      path(scene, starPath(x, y, scale * .29), options.ink ? '#555b56' : '#b07b31', .23, '#ffffff');
    }
    if (!minimal) {
      const green = options.ink ? '#393e3a' : '#3f7150', orange = options.ink ? '#393e3a' : '#b87533';
      const markerSize = Math.max(1.9, scale * .52);
      circle(scene, startOuter[0], startOuter[1], scale * .15, green);
      path(scene, starPath(endOuter[0], endOuter[1], scale * .22), orange, .23, '#fff');
      text(scene, '起点', startOuter[0] - scale * .3, startOuter[1] - scale * .55, markerSize, green, 600, 'middle');
      text(scene, '终点', endOuter[0] + scale * .2, endOuter[1] - scale * .55, markerSize, orange, 600, 'middle');
    }
    scene.mazeMetrics.push({ id: maze.id, cellSizeMM: scale * (maze.cellSize || 1), cols: maze.cols, rows: maze.rows });
  }
  function makeScene(mazes, options, pageIndex, pageTotal, answer = false) {
    const minimal = options.minimal !== false;
    const perPage = Number(options.perPage) || 2, compact = perPage === 6;
    const scene = { ...PAGE, elements: [], mazeMetrics: [], answer, pageIndex, pageTotal, minimal };
    if (!minimal) {
      const title = (options.title || '我的迷宫小冒险').slice(0, 24);
      text(scene, 'LITTLE MAZE CLUB', 8, 9.8, 2.6, '#647267', 600);
      text(scene, answer ? `${title} · 答案` : title, 8, 20.5, title.length > 17 ? 4.6 : 5.5, '#253e2e', 700);
      if (options.nameLine && !answer) text(scene, '姓名：________    日期：________', 202, 28, 2.75, '#626a62', 400, 'end');
      text(scene, answer ? '给陪伴孩子探索的大朋友 · 灰色路线为参考答案' : '拿起画笔，和好奇心一起出发！', 8, 28, 2.7, '#73796e');
      line(scene, 8, 32, 202, 32, '#c9d1c6', .32);
    }
    const columns = perPage >= 4 ? 2 : 1;
    const count = Math.min(mazes.length, perPage), rows = Math.max(1, Math.ceil(count / columns));
    const margin = minimal ? 6 : 8, top = minimal ? 6 : 37;
    const contentWidth = PAGE.width - margin * 2, contentHeight = minimal ? 285 : 244;
    const gap = columns === 2 ? 3 : 0, rowGap = rows > 1 ? 3 : 0;
    const detailsHeight = minimal ? 1 : compact ? 8 : 21;
    // Let a single maze in the last row use the full width. Allocate taller
    // shapes more height, instead of leaving the same empty box around each one.
    const rowLayouts = Array.from({ length: rows }, (_, row) => {
      const items = mazes.slice(row * columns, Math.min((row + 1) * columns, count));
      const rowColumns = Math.max(1, items.length), width = (contentWidth - gap * (rowColumns - 1)) / rowColumns;
      const preferredHeight = Math.max(1, ...items.map(maze =>
        (width - 1) * (maze.rows + (minimal ? (maze.topology ? 1.3 : 2.1) : 2.4))
          / (maze.cols + (minimal ? (maze.topology ? 1.3 : 2.1) : 2.4)) + detailsHeight));
      return { width, preferredHeight };
    });
    const heightBudget = contentHeight - rowGap * (rows - 1);
    const preferredTotal = rowLayouts.reduce((sum, row) => sum + row.preferredHeight, 0);
    let nextY = top;
    for (const row of rowLayouts) {
      row.height = heightBudget * row.preferredHeight / preferredTotal;
      row.y = nextY; nextY += row.height + rowGap;
    }
    for (let i = 0; i < count; i++) {
      const maze = mazes[i], layout = rowLayouts[Math.floor(i / columns)];
      const slotWidth = layout.width, slotHeight = layout.height;
      const x = margin + (i % columns) * (slotWidth + gap), y = layout.y;
      if (minimal) {
        drawMaze(scene, maze, { x: x + .5, y: y + .5, w: slotWidth - 1, h: slotHeight - 1 }, { ...options, answer });
        continue;
      }
      const shape = Shapes.byId[maze.shape];
      const number = pageIndex * perPage + i + 1;
      circle(scene, x + 3, y + 1.7, 3, '#f0f2ec');
      text(scene, String(number).padStart(2, '0'), x + 3, y + 2.65, 2.5, '#52664e', 600, 'middle');
      text(scene, shape.name + '迷宫', x + 8.6, y + 3, perPage >= 4 ? 3.5 : 4, '#303b31', 600);
      text(scene, Engine.DIFFICULTIES[maze.difficulty].name, x + slotWidth, y + 2.5, 2.6, '#797d70', 400, 'end');
      if (!compact) {
        const mission = maze.mode === 'story' ? `陪${shape.name}一起出发，找到迷宫的出口。` : Engine.MODES.find(m => m.id === maze.mode)?.description || Engine.MODES[0].description;
        text(scene, mission, x, y + 10.7, perPage >= 4 ? 2.45 : 2.7, '#777d72');
      }
      drawMaze(scene, maze, { x: x + .5, y: y + (compact ? 7 : 13), w: slotWidth - 1, h: slotHeight - (compact ? 8 : 21) }, { ...options, answer, compact });
      if (!answer && !compact) {
        text(scene, '我完成啦！', x + slotWidth - 17, y + slotHeight - 6, 2.25, '#8a8e83', 400, 'end');
        path(scene, starPath(x + slotWidth - 11, y + slotHeight - 7, 2.15), '#a4aa9d', .22, '#fff');
      }
      if (Math.floor(i / columns) < rows - 1) line(scene, x, y + slotHeight - 1, x + slotWidth, y + slotHeight - 1, '#d7dbd2', .2, [1.3, 1.5]);
    }
    if (!minimal) {
      line(scene, 8, 284, 202, 284, '#d7dcd1');
      text(scene, '小小迷宫工坊  ·  快乐探索，慢慢长大', 8, 291, 2.45, '#91968a');
      text(scene, `${answer ? '答案 ' : ''}${String(pageIndex + 1).padStart(2, '0')} / ${String(pageTotal).padStart(2, '0')}`, 202, 291, 2.6, '#818a79', 400, 'end');
    }
    if (options.ink) for (const element of scene.elements) for (const field of ['color', 'fill', 'stroke']) {
      const color = element[field];
      if (!color || color === 'none') continue;
      let hex = color.slice(1);
      if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
      const channels = hex.match(/../g).map(c => parseInt(c, 16));
      const gray = Math.round(channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722).toString(16).padStart(2, '0');
      element[field] = '#' + gray.repeat(3);
    }
    return scene;
  }
  function makeScenes(mazes, options, withAnswers = false) {
    const count = Math.ceil(mazes.length / options.perPage), pages = [];
    for (let p = 0; p < count; p++) pages.push(makeScene(mazes.slice(p * options.perPage, (p + 1) * options.perPage), options, p, count));
    if (withAnswers) for (let p = 0; p < count; p++) pages.push(makeScene(mazes.slice(p * options.perPage, (p + 1) * options.perPage), options, p, count, true));
    return pages;
  }
  function toSVG(scene, accessible = false) {
    const elements = scene.elements.map(el => {
      if (el.type === 'text') return `<text x="${n(el.x)}" y="${n(el.y)}" font-size="${n(el.size)}" fill="${el.color}" font-weight="${el.weight}" text-anchor="${el.anchor}">${escape(el.value)}</text>`;
      if (el.type === 'circle') return `<circle cx="${n(el.x)}" cy="${n(el.y)}" r="${n(el.radius)}" fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.width}"/>`;
      return `<path d="${el.d}" fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.width}"${el.dash ? ` stroke-dasharray="${el.dash.join(' ')}"` : ''}/>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210mm" height="297mm" font-family="'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',Arial,sans-serif" stroke-linecap="round" stroke-linejoin="round"${accessible ? ` role="img" aria-label="${scene.answer ? '答案' : '迷宫'}第${scene.pageIndex + 1}页"` : ''}><rect width="210" height="297" fill="white"/>${elements}</svg>`;
  }
  async function toCanvas(scene, dpi = 300) {
    if (document.fonts?.ready) await document.fonts.ready;
    const svg = toSVG(scene);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('图片渲染失败，请重试')); img.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(210 / 25.4 * dpi); canvas.height = Math.round(297 / 25.4 * dpi);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器无法创建图片画布');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally { URL.revokeObjectURL(url); }
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function downloadPNG(scene, filename) {
    const canvas = await toCanvas(scene);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('图片导出失败，请重试');
    download(await pngWithDPI(blob, 300), filename);
  }
  async function pngWithDPI(blob, dpi) {
    const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer);
    const chunk = new Uint8Array(21), chunkView = new DataView(chunk.buffer);
    chunkView.setUint32(0, 9);
    chunk.set([112, 72, 89, 115], 4); // pHYs: pixels per metre, both axes.
    const pixelsPerMetre = Math.round(dpi / .0254);
    chunkView.setUint32(8, pixelsPerMetre); chunkView.setUint32(12, pixelsPerMetre); chunk[16] = 1;
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, 17)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    chunkView.setUint32(17, (crc ^ 0xffffffff) >>> 0);
    const pieces = [bytes.subarray(0, 8)];
    for (let offset = 8; offset < bytes.length;) {
      const end = offset + view.getUint32(offset) + 12;
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (type !== 'pHYs') pieces.push(bytes.subarray(offset, end));
      if (type === 'IHDR') pieces.push(chunk);
      offset = end;
    }
    return new Blob(pieces, { type: 'image/png' });
  }

  // A small PDF writer: maze walls remain vector paths; Chinese labels are embedded
  // as high-resolution text images, so exported PDFs need no external fonts.
  const PT = 72 / 25.4, encoder = new TextEncoder();
  const px = value => n(value * PT), py = value => n((297 - value) * PT);
  function rgb(hex) {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? [...value].map(c => c + c).join('') : value;
    return full.match(/../g).map(c => n(parseInt(c, 16) / 255)).join(' ');
  }
  function paint(el) {
    let s = 'q\n';
    if (el.fill !== 'none') s += `${rgb(el.fill)} rg\n`;
    if (el.stroke !== 'none') s += `${rgb(el.stroke)} RG\n${px(el.width)} w\n1 J 1 j\n`;
    s += `[${(el.dash || []).map(px).join(' ')}] 0 d\n`;
    if (el.type === 'circle') {
      const x = px(el.x), y = py(el.y), r = px(el.radius), k = r * .5522847498;
      s += `${n(x + r)} ${y} m\n${n(x + r)} ${n(y + k)} ${n(x + k)} ${n(y + r)} ${x} ${n(y + r)} c\n${n(x - k)} ${n(y + r)} ${n(x - r)} ${n(y + k)} ${n(x - r)} ${y} c\n${n(x - r)} ${n(y - k)} ${n(x - k)} ${n(y - r)} ${x} ${n(y - r)} c\n${n(x + k)} ${n(y - r)} ${n(x + r)} ${n(y - k)} ${n(x + r)} ${y} c\nh\n`;
    } else {
      const tokens = el.d.match(/[MLCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
      for (let i = 0; i < tokens.length;) {
        const op = tokens[i++];
        if (op === 'Z') s += 'h\n';
        else if (op === 'C') s += `${px(Number(tokens[i++]))} ${py(Number(tokens[i++]))} ${px(Number(tokens[i++]))} ${py(Number(tokens[i++]))} ${px(Number(tokens[i++]))} ${py(Number(tokens[i++]))} c\n`;
        else s += `${px(Number(tokens[i++]))} ${py(Number(tokens[i++]))} ${op === 'M' ? 'm' : 'l'}\n`;
      }
    }
    s += el.fill !== 'none' ? (el.stroke !== 'none' ? 'B\n' : 'f\n') : 'S\n';
    return s + 'Q\n';
  }
  function textImage(el) {
    const density = 12, fontSize = el.size * density, pad = 3;
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器无法创建 PDF 文本');
    const font = `${el.weight} ${fontSize}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",Arial,sans-serif`;
    ctx.font = font;
    const metrics = ctx.measureText(el.value);
    const ascent = Math.ceil(metrics.actualBoundingBoxAscent || fontSize), descent = Math.ceil(metrics.actualBoundingBoxDescent || fontSize * .25);
    canvas.width = Math.max(1, Math.ceil(metrics.width) + pad * 2); canvas.height = Math.max(1, ascent + descent + pad * 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = font; ctx.fillStyle = el.color; ctx.textBaseline = 'alphabetic'; ctx.fillText(el.value, pad, pad + ascent);
    const base64 = canvas.toDataURL('image/jpeg', .98).split(',')[1];
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const anchorOffset = el.anchor === 'end' ? metrics.width : el.anchor === 'middle' ? metrics.width / 2 : 0;
    return { bytes, width: canvas.width, height: canvas.height, w: canvas.width / density, h: canvas.height / density, x: el.x - (anchorOffset + pad) / density, y: el.y - (ascent + pad) / density };
  }
  async function createPDF(scenes, onProgress = () => {}) {
    if (document.fonts?.ready) await document.fonts.ready;
    const objects = [null, null];
    const add = value => { objects.push(value); return objects.length; };
    const stream = (dictionary, bytes) => [encoder.encode(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`), bytes, encoder.encode('\nendstream')];
    const pageIds = [];
    for (let i = 0; i < scenes.length; i++) {
      let content = '', resources = '', imageIndex = 0;
      for (const el of scenes[i].elements) {
        if (el.type !== 'text') { content += paint(el); continue; }
        const image = textImage(el), name = `Im${++imageIndex}`;
        const imageId = add(stream(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, image.bytes));
        resources += `/${name} ${imageId} 0 R `;
        content += `q\n${px(image.w)} 0 0 ${px(image.h)} ${px(image.x)} ${py(image.y + image.h)} cm\n/${name} Do\nQ\n`;
      }
      const contentId = add(stream('', encoder.encode(content)));
      pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${px(210)} ${px(297)}] /Resources << /XObject << ${resources} >> >> /Contents ${contentId} 0 R >>`));
      onProgress(i + 1, scenes.length);
      // Keep controls responsive when exporting a full workbook.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    const chunks = [encoder.encode('%PDF-1.4\n% Little Maze Club\n')], offsets = [0];
    let offset = chunks[0].length;
    objects.forEach((object, index) => {
      offsets.push(offset);
      const pieces = [encoder.encode(`${index + 1} 0 obj\n`), ...(Array.isArray(object) ? object : [encoder.encode(object)]), encoder.encode('\nendobj\n')];
      for (const piece of pieces) { chunks.push(piece); offset += piece.length; }
    });
    const xrefOffset = offset;
    const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    chunks.push(encoder.encode(xref));
    return new Blob(chunks, { type: 'application/pdf' });
  }
  root.MazeDocument = { PAGE, makeScene, makeScenes, toSVG, toCanvas, createPDF, downloadPNG, download, escape };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MazeDocument;
})(typeof window !== 'undefined' ? window : globalThis);
