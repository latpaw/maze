'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Shapes = require('../js/shapes.js');
const Engine = require('../js/maze.js');
const Document = require('../js/document.js');
const { assertGraphMaze } = require('./graph-assertions.cjs');

const LAYOUTS = [1, 2, 4, 6];
const SEEDS = [0, 17371, 0xffffffff];
const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function context(shape, difficulty, perPage, seed) {
  return `${shape.id}, difficulty=${difficulty}, perPage=${perPage}, seed=${seed}`;
}

// Verify graph invariants independently of the production validate() function.
// A connected undirected graph with exactly N-1 edges has exactly one route
// between every pair of cells, including the advertised entrance and exit.
function assertMaze(maze, label) {
  if (maze.topology) return assertGraphMaze(maze, label);
  const cells = new Set(maze.cells);
  assert.equal(cells.size, maze.cells.length, `${label}: duplicate cells`);
  assert.equal(maze.mask.length, maze.cols * maze.rows, `${label}: grid size`);
  assert.deepEqual(
    Array.from(maze.mask, (inside, i) => inside ? i : -1).filter(i => i !== -1),
    [...cells].sort((a, b) => a - b),
    `${label}: mask and cells differ`
  );
  assert.ok(cells.size >= 8, `${label}: too few cells`);

  const neighbors = cell => {
    const found = [];
    assert.equal(maze.links[cell] & ~15, 0, `${label}: invalid link bits`);
    for (let dir = 0; dir < 4; dir++) {
      if (!(maze.links[cell] & (1 << dir))) continue;
      const x = cell % maze.cols + directions[dir][0];
      const y = Math.floor(cell / maze.cols) + directions[dir][1];
      assert.ok(x >= 0 && x < maze.cols && y >= 0 && y < maze.rows, `${label}: link outside grid`);
      const next = y * maze.cols + x;
      assert.ok(cells.has(next), `${label}: link outside silhouette`);
      assert.ok(maze.links[next] & (1 << ((dir + 2) % 4)), `${label}: asymmetric link`);
      found.push(next);
    }
    return found;
  };
  const adjacency = new Map([...cells].map(cell => [cell, neighbors(cell)]));
  let directedEdges = 0;
  for (const links of adjacency.values()) directedEdges += links.length;
  assert.equal(directedEdges / 2, cells.size - 1, `${label}: graph has cycles or missing passages`);

  for (const [name, mark] of [['start', maze.start], ['end', maze.end]]) {
    assert.ok(cells.has(mark.cell), `${label}: ${name} is outside the maze`);
    assert.ok(Number.isInteger(mark.dir) && mark.dir >= 0 && mark.dir < 4, `${label}: invalid ${name} direction`);
    const x = mark.cell % maze.cols + directions[mark.dir][0];
    const y = Math.floor(mark.cell / maze.cols) + directions[mark.dir][1];
    assert.ok(x < 0 || x >= maze.cols || y < 0 || y >= maze.rows || !cells.has(y * maze.cols + x), `${label}: ${name} does not open to an exterior edge`);
    assert.equal(maze.links[mark.cell] & (1 << mark.dir), 0, `${label}: exterior opening is an internal link`);
  }
  assert.notEqual(maze.start.cell, maze.end.cell, `${label}: identical entrance and exit`);

  const parents = new Map([[maze.start.cell, null]]);
  const queue = [maze.start.cell];
  for (let index = 0; index < queue.length; index++) {
    for (const next of adjacency.get(queue[index])) {
      if (parents.has(next)) continue;
      parents.set(next, queue[index]);
      queue.push(next);
    }
  }
  assert.equal(parents.size, cells.size, `${label}: disconnected maze`);
  const expectedPath = [];
  for (let cell = maze.end.cell; cell !== null; cell = parents.get(cell)) expectedPath.push(cell);
  expectedPath.reverse();
  assert.deepEqual(maze.solution, expectedPath, `${label}: answer does not match the unique route`);
  assert.equal(new Set(maze.solution).size, maze.solution.length, `${label}: answer repeats a cell`);
  assert.equal(maze.stars.length, 3, `${label}: star count`);
  assert.equal(new Set(maze.stars).size, 3, `${label}: stars overlap`);
  for (const cell of maze.stars) {
    assert.ok(maze.solution.includes(cell), `${label}: star is off the answer route`);
    assert.notEqual(cell, maze.start.cell, `${label}: star covers entrance`);
    assert.notEqual(cell, maze.end.cell, `${label}: star covers exit`);
  }

  const canonicalWall = segment => {
    const [x1, y1, x2, y2] = segment;
    return x1 < x2 || (x1 === x2 && y1 < y2) ? segment.join(',') : [x2, y2, x1, y1].join(',');
  };
  const wallSet = new Set(maze.walls.map(canonicalWall));
  assert.equal(wallSet.size, maze.walls.length, `${label}: duplicate walls`);
  for (const cell of cells) {
    const x = cell % maze.cols, y = Math.floor(cell / maze.cols);
    const segments = [[x, y, x + 1, y], [x + 1, y, x + 1, y + 1], [x, y + 1, x + 1, y + 1], [x, y, x, y + 1]];
    for (let dir = 0; dir < 4; dir++) {
      const opening = (cell === maze.start.cell && dir === maze.start.dir) || (cell === maze.end.cell && dir === maze.end.dir);
      const passage = Boolean(maze.links[cell] & (1 << dir));
      assert.equal(wallSet.has(canonicalWall(segments[dir])), !opening && !passage, `${label}: wall blocks a passage or leaves an extra opening`);
    }
  }
}

function makeMaze(shape, difficulty, perPage, seed = 17371, id = shape.id) {
  return Engine.generate({ id, shape: shape.id, difficulty, seed, mode: 'collect' }, perPage);
}

test('the catalogue contains 106 distinct ids, names, and actual silhouettes', () => {
  assert.equal(Shapes.shapes.length, 106);
  assert.equal(new Set(Shapes.shapes.map(shape => shape.id)).size, 106);
  assert.equal(new Set(Shapes.shapes.map(shape => shape.name)).size, 106);
  assert.equal(Shapes.groups.length, 11);
  const silhouettes = new Set();
  for (const shape of Shapes.shapes) {
    assert.equal(Shapes.byId[shape.id], shape);
    assert.ok(shape.bounds.every(Number.isFinite), `${shape.id}: invalid bounds`);
    let raster = '';
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) raster += Shapes.contains(shape, x + .5, y + .5) ? '1' : '0';
    assert.ok(raster.includes('1'), `${shape.id}: empty silhouette`);
    if (['slanted-hexagon', 'slanted-triangle'].includes(shape.id)) continue;
    assert.ok(!silhouettes.has(raster), `${shape.id}: duplicate silhouette`);
    silhouettes.add(raster);
  }
});

for (const perPage of LAYOUTS) {
  test(`all catalogue shapes × four difficulties × three seeds are solvable trees at ${perPage} per page`, () => {
    for (const shape of Shapes.shapes) for (let difficulty = 0; difficulty < 4; difficulty++) for (const seed of SEEDS) {
      assertMaze(makeMaze(shape, difficulty, perPage, seed), context(shape, difficulty, perPage, seed));
    }
  });
}

test('fixed seeds reproduce every generated cell, wall, answer and star', () => {
  const snapshot = maze => ({
    shape: maze.shape, difficulty: maze.difficulty, resolution: maze.resolution,
    cols: maze.cols, rows: maze.rows, mask: maze.mask, cells: maze.cells,
    links: maze.links, solution: maze.solution, walls: maze.walls,
    start: maze.start, end: maze.end, stars: maze.stars,
  });
  for (const id of ['square', 'fish', 'elephant', 'cup', 'santa', 'moon']) for (const perPage of LAYOUTS) {
    const shape = Shapes.byId[id];
    const first = makeMaze(shape, 3, perPage, 0xffffffff);
    makeMaze(Shapes.byId.house, 0, perPage, 7);
    assert.deepEqual(snapshot(makeMaze(shape, 3, perPage, 0xffffffff)), snapshot(first), `${id}: fixed seed changed`);
    assert.notDeepEqual(snapshot(makeMaze(shape, 3, perPage, 17371)), snapshot(first), `${id}: changing seed had no effect`);
  }
});

test('1/2/4/6 per-page pagination preserves order, expanded partial pages, numbering and matching answer pages', () => {
  for (const perPage of LAYOUTS) for (const count of [0, 1, 2, 3, 5, 6, 7, 12, 13, 20]) {
    const mazes = Array.from({ length: count }, (_, i) => makeMaze(Shapes.shapes[i], i % 4, perPage, i, `item-${i}`));
    const options = { perPage, title: '我的迷宫', nameLine: true, minimal: false };
    const pageCount = Math.ceil(count / perPage);
    const exercises = Document.makeScenes(mazes, options);
    const pages = Document.makeScenes(mazes, options, true);
    assert.equal(exercises.length, pageCount);
    assert.equal(pages.length, pageCount * 2);
    assert.deepEqual(pages.slice(0, pageCount).flatMap(page => page.mazeMetrics.map(m => m.id)), mazes.map(m => m.id));
    for (let p = 0; p < pageCount; p++) {
      const exercise = pages[p], answer = pages[p + pageCount];
      const slice = mazes.slice(p * perPage, (p + 1) * perPage);
      assert.equal(exercise.answer, false);
      assert.equal(answer.answer, true);
      assert.equal(exercise.pageIndex, p);
      assert.equal(answer.pageIndex, p);
      assert.equal(exercise.pageTotal, pageCount);
      assert.equal(answer.pageTotal, pageCount);
      assert.deepEqual(exercise.mazeMetrics, answer.mazeMetrics);
      assert.equal(exercise.mazeMetrics.length, slice.length);
      assert.ok(exercise.elements.some(el => el.type === 'text' && el.value.startsWith('姓名：')));
      assert.ok(!answer.elements.some(el => el.type === 'text' && el.value.startsWith('姓名：')));
      for (let i = 0; i < slice.length; i++) {
        const number = String(p * perPage + i + 1).padStart(2, '0');
        assert.ok(exercise.elements.some(el => el.type === 'text' && el.value === number), `missing exercise ${number}`);
        assert.ok(answer.elements.some(el => el.type === 'text' && el.value === number), `missing answer ${number}`);
        const one = Document.makeScenes([slice[i]], options)[0].mazeMetrics[0];
        assert.ok(one.cellSizeMM >= exercise.mazeMetrics[i].cellSizeMM - 1e-9, 'a maze alone uses at least as much space as a crowded page');
      }
      const isAnswerRoute = el => el.type === 'path' && ['#96b59a', '#9a9a9a'].includes(el.stroke);
      assert.equal(exercise.elements.filter(isAnswerRoute).length, 0, 'exercise contains an answer route');
      assert.equal(answer.elements.filter(isAnswerRoute).length, slice.length, 'answer routes are absent');
    }
  }
});

test('user title text is escaped in SVG and cannot create markup', () => {
  assert.equal(Document.escape('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  const title = '<script>&"\'</script>';
  const maze = makeMaze(Shapes.byId.fish, 0, 2);
  for (const page of Document.makeScenes([maze], { perPage: 2, title, minimal: false }, true)) {
    const svg = Document.toSVG(page, true);
    assert.ok(svg.includes(Document.escape(title)));
    assert.ok(!svg.includes('<script>'));
    assert.ok(!svg.includes('</script>'));
    assert.match(svg, /viewBox="0 0 210 297" width="210mm" height="297mm"/);
    assert.match(svg, /role="img" aria-label="(?:迷宫|答案)第1页"/);
  }
});

test('ink-saving mode uses only grayscale colors throughout exercises and answers', () => {
  const maze = makeMaze(Shapes.byId.fish, 1, 4);
  for (const minimal of [false, true]) for (const scene of Document.makeScenes([maze], { perPage: 4, ink: true, minimal }, true)) {
    for (const element of scene.elements) for (const field of ['color', 'fill', 'stroke']) {
      const color = element[field];
      if (!color || color === 'none') continue;
      assert.match(color, /^#([0-9a-f]{2})\1\1$/i, `${field} contains colored ink: ${color}`);
    }
  }
});

test('minimal mode is the default and retains only maze paths in all layouts and answer pages', () => {
  for (const perPage of LAYOUTS) for (const minimal of [undefined, true]) {
    const mazes = Array.from({ length: 7 }, (_, i) => ({ ...makeMaze(Shapes.shapes[i], 1, 4, i, `maze-${i}`), mode: 'classic' }));
    const options = { perPage, minimal, title: '不应显示的标题', nameLine: true };
    const pageCount = Math.ceil(mazes.length / perPage);
    const pages = Document.makeScenes(mazes, options, true);
    assert.equal(pages.length, pageCount * 2);
    assert.deepEqual(pages.slice(0, pageCount).flatMap(scene => scene.mazeMetrics.map(m => m.id)), mazes.map(m => m.id));
    for (const scene of pages) {
      assert.equal(scene.minimal, true);
      const count = scene.mazeMetrics.length;
      assert.equal(scene.elements.length, count * (scene.answer ? 2 : 1), 'only walls and optional answer routes remain');
      assert.ok(scene.elements.every(element => element.type === 'path' && !element.dash), 'no labels, badges, rewards or dividers');
      const svg = Document.toSVG(scene);
      assert.ok(!svg.includes('<text'));
      assert.ok(!svg.includes('<circle'));
      assert.ok(!svg.includes('不应显示的标题'));
      assertSceneBounds(scene, `minimal layout=${perPage}`);
      const decorated = Document.makeScene(mazes.slice(scene.pageIndex * perPage, (scene.pageIndex + 1) * perPage), { ...options, minimal: false }, scene.pageIndex, pageCount, scene.answer);
      for (let i = 0; i < count; i++) assert.ok(scene.mazeMetrics[i].cellSizeMM > decorated.mazeMetrics[i].cellSizeMM, 'removed metadata space enlarges the maze');
      const sameMazeAlone = Document.makeScenes([mazes[scene.pageIndex * perPage]], options)[0].mazeMetrics[0];
      assert.ok(sameMazeAlone.cellSizeMM >= scene.mazeMetrics[0].cellSizeMM - 1e-9, 'a maze alone uses at least as much space as a crowded page');
    }
    for (let p = 0; p < pageCount; p++) assert.deepEqual(pages[p].mazeMetrics, pages[p + pageCount].mazeMetrics);
  }
});

test('minimal mode retains collection stars without adding any surrounding information', () => {
  const maze = makeMaze(Shapes.byId.fish, 1, 4);
  for (const scene of Document.makeScenes([maze], { perPage: 2 }, true)) {
    assert.equal(scene.elements.length, scene.answer ? 5 : 4, 'one wall path, three stars, and optional solution');
    assert.ok(scene.elements.every(element => element.type === 'path'));
  }
});

function assertSceneBounds(scene, label) {
  assert.equal(scene.width, 210);
  assert.equal(scene.height, 297);
  const contains = (x, y, padding = 0) => {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `${label}: non-finite coordinates`);
    assert.ok(x - padding >= 0 && x + padding <= 210 && y - padding >= 0 && y + padding <= 297, `${label}: drawing extends outside A4 at ${x},${y}`);
  };
  for (const element of scene.elements) {
    if (element.type === 'circle') {
      contains(element.x, element.y, element.radius + (element.stroke === 'none' ? 0 : element.width / 2));
    } else if (element.type === 'path') {
      const tokens = element.d.match(/[MLCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
      assert.ok(tokens.length, `${label}: unparsed path`);
      for (let i = 0; i < tokens.length;) {
        const type = tokens[i++], count = type === 'C' ? 3 : type === 'Z' ? 0 : 1;
        assert.ok(['M', 'L', 'C', 'Z'].includes(type), `${label}: unknown path operation ${type}`);
        for (let pair = 0; pair < count; pair++) contains(Number(tokens[i++]), Number(tokens[i++]), element.stroke === 'none' ? 0 : element.width / 2);
      }
    } else if (element.type === 'text') {
      contains(element.x, element.y);
      assert.ok(element.y - element.size >= 0, `${label}: text ascender crosses A4 edge`);
    }
  }
}

test('every shape and difficulty fits A4 with legible cells in standard and compact layouts', () => {
  const undersized = [];
  for (const perPage of LAYOUTS) for (const shape of Shapes.shapes) for (let difficulty = 0; difficulty < 4; difficulty++) {
    const maze = makeMaze(shape, difficulty, perPage);
    const label = context(shape, difficulty, perPage, 17371);
    for (const minimal of [false, true]) for (const scene of Document.makeScenes(Array.from({ length: perPage }, () => maze), { perPage, nameLine: true, title: '我的迷宫小冒险', minimal }, true)) {
      assertSceneBounds(scene, label);
      const minimum = Engine.DIFFICULTIES[difficulty].minCell * (perPage === 6 && !minimal ? .75 : 1);
      for (const metric of scene.mazeMetrics) if (metric.cellSizeMM < minimum - 1e-9) undersized.push(`${label}, minimal=${minimal}: ${metric.cellSizeMM.toFixed(4)} mm`);
    }
  }
  assert.deepEqual([...new Set(undersized)], [], 'A4 scale must account for rounded raster row/column counts');
});

test('raster connectivity cleanup does not discard a major part of a silhouette', () => {
  const losses = [];
  for (const perPage of LAYOUTS) for (const shape of Shapes.shapes) for (let difficulty = 0; difficulty < 4; difficulty++) {
    const grid = Engine.makeMask(shape, Engine.resolutionFor(shape, difficulty, perPage));
    const loss = 1 - grid.cells.length / grid.rawCount;
    if (loss > .05) losses.push(`${context(shape, difficulty, perPage, 'any')}: ${(100 * loss).toFixed(2)}% discarded (${grid.rawCount} to ${grid.cells.length} cells)`);
  }
  assert.deepEqual(losses, [], 'disconnected silhouette parts must be joined, rather than silently removed');
});
