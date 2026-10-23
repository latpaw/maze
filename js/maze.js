(function (root) {
  'use strict';
  const Shapes = root.MazeShapes || (typeof require === 'function' ? require('./shapes.js') : null);
  const Graph = root.MazeGraph || (typeof require === 'function' ? require('./graph-maze.js') : null);
  const DIFFICULTIES = [
    { name: '入门', hint: '宽宽的路，轻松出发', size: 15, minCell: 3.4, tendency: .18, ratio: .34 },
    { name: '简单', hint: '转个弯，发现小惊喜', size: 19, minCell: 3.2, tendency: .60, ratio: .49 },
    { name: '进阶', hint: '多看一眼，再做决定', size: 30, minCell: 2.6, tendency: .94, ratio: .65 },
    { name: '挑战', hint: '密集通道，岔路与死胡同的耐心挑战', size: 46, minCell: 2.0, tendency: .92, ratio: .62 },
  ];
  const MODES = [
    { id: 'classic', name: '经典迷宫', description: '沿着通道，从起点走到终点。' },
    { id: 'story', name: '故事任务', description: '带着小伙伴，一起找到出口吧！' },
    { id: 'collect', name: '收集星星', description: '收集路上的 3 颗星星，再到达终点。' },
  ];
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6D2B79F5;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function resolutionFor(shape, difficulty, perPage = 2) {
    const [x1, y1, x2, y2] = shape.bounds;
    const w = x2 - x1, h = y2 - y1, longest = Math.max(w, h);
    const space = perPage >= 4 ? [94, 92] : perPage === 2 ? [193, 98] : [193, 228];
    // Reserve the entrance/exit labels while allowing finer corridors at higher levels.
    let resolution = DIFFICULTIES[difficulty].size;
    while (resolution > 8) {
      const cols = Math.ceil(w / longest * resolution - 1e-9), rows = Math.ceil(h / longest * resolution - 1e-9);
      if (Math.min(space[0] / (cols + 2.4), space[1] / (rows + 2.4)) >= DIFFICULTIES[difficulty].minCell) break;
      resolution--;
    }
    return resolution;
  }
  function makeMask(shape, resolution) {
    const [minX, minY, maxX, maxY] = shape.bounds;
    const step = Math.max(maxX - minX, maxY - minY) / resolution;
    const cols = Math.ceil((maxX - minX) / step - 1e-9), rows = Math.ceil((maxY - minY) / step - 1e-9);
    const mask = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      mask[y * cols + x] = Shapes.contains(shape, minX + (x + .5) * step, minY + (y + .5) * step) ? 1 : 0;
    }
    const neighbor = (i, d) => {
      const x = i % cols + directions[d][0], y = Math.floor(i / cols) + directions[d][1];
      return x < 0 || y < 0 || x >= cols || y >= rows ? -1 : y * cols + x;
    };
    // Some fine tips can be smaller than a pencil-width cell. Retain the connected body.
    const seen = new Uint8Array(mask.length);
    let largest = [], rawCount = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) {
      rawCount++;
      if (seen[i]) continue;
      const component = [i]; seen[i] = 1;
      for (let p = 0; p < component.length; p++) for (let d = 0; d < 4; d++) {
        const next = neighbor(component[p], d);
        if (next >= 0 && mask[next] && !seen[next]) { seen[next] = 1; component.push(next); }
      }
      if (component.length > largest.length) largest = component;
    }
    mask.fill(0); largest.forEach(i => { mask[i] = 1; });
    if (largest.length < 8) throw new Error(`造型“${shape.name}”的可用区域太小`);
    return { cols, rows, mask, cells: largest.sort((a, b) => a - b), neighbor, rawCount };
  }
  function endpoints(grid) {
    const { cols, rows, cells, mask, neighbor } = grid;
    let start = null, end = null, startScore = Infinity, endScore = -Infinity;
    for (const i of cells) {
      const x = i % cols, y = Math.floor(i / cols);
      if (neighbor(i, 3) < 0 || !mask[neighbor(i, 3)]) {
        const score = x + Math.abs(y + .5 - rows * .5) * .22;
        if (score < startScore) { startScore = score; start = { cell: i, dir: 3 }; }
      }
      if (neighbor(i, 1) < 0 || !mask[neighbor(i, 1)]) {
        const score = x - Math.abs(y + .5 - rows * .5) * .22;
        if (score > endScore) { endScore = score; end = { cell: i, dir: 1 }; }
      }
    }
    return { start, end };
  }
  function carve(grid, rng, tendency, origin) {
    const links = new Uint8Array(grid.mask.length), seen = new Uint8Array(grid.mask.length);
    const first = origin === undefined ? grid.cells[Math.floor(rng() * grid.cells.length)] : origin, active = [first];
    seen[first] = 1;
    while (active.length) {
      const index = rng() < tendency ? active.length - 1 : Math.floor(rng() * active.length);
      const cell = active[index], choices = [];
      for (let d = 0; d < 4; d++) {
        const next = grid.neighbor(cell, d);
        if (next >= 0 && grid.mask[next] && !seen[next]) choices.push([d, next]);
      }
      if (!choices.length) { active.splice(index, 1); continue; }
      const [dir, next] = choices[Math.floor(rng() * choices.length)];
      links[cell] |= 1 << dir; links[next] |= 1 << ((dir + 2) % 4);
      seen[next] = 1; active.push(next);
    }
    return links;
  }
  function solve(grid, links, start, end) {
    const parent = new Int32Array(grid.mask.length).fill(-1), queue = [start.cell];
    parent[start.cell] = start.cell;
    for (let p = 0; p < queue.length && parent[end.cell] === -1; p++) {
      const cell = queue[p];
      for (let d = 0; d < 4; d++) if (links[cell] & (1 << d)) {
        const next = grid.neighbor(cell, d);
        if (parent[next] === -1) { parent[next] = cell; queue.push(next); }
      }
    }
    if (parent[end.cell] === -1) throw new Error('迷宫没有连通');
    const path = [end.cell];
    while (path[path.length - 1] !== start.cell) path.push(parent[path[path.length - 1]]);
    return path.reverse();
  }
  function routeStats(links, solution) {
    const decisions = solution.filter(i => [0, 1, 2, 3].filter(d => links[i] & (1 << d)).length >= 3).length;
    let turns = 0;
    for (let k = 2; k < solution.length; k++) if (solution[k] - solution[k - 1] !== solution[k - 1] - solution[k - 2]) turns++;
    return { solution, decisions, turns };
  }
  function branchStats(grid, links, solution) {
    const route = new Set(solution);
    let deadEnds = 0, branches = 0, deepBranches = 0, decoyDepth = 0;
    for (const cell of grid.cells) {
      const degree = directions.filter((_, d) => links[cell] & (1 << d)).length;
      if (degree === 1) deadEnds++;
      if (degree >= 3) branches++;
    }
    for (const cell of solution) for (let d = 0; d < 4; d++) if (links[cell] & (1 << d)) {
      const next = grid.neighbor(cell, d);
      if (route.has(next)) continue;
      const pending = [[next, cell, 1]];
      let depth = 0;
      for (const [current, parent, level] of pending) {
        depth = Math.max(depth, level);
        for (let direction = 0; direction < 4; direction++) if (links[current] & (1 << direction)) {
          const neighbor = grid.neighbor(current, direction);
          if (neighbor !== parent) pending.push([neighbor, current, level + 1]);
        }
      }
      if (depth >= 3) deepBranches++;
      decoyDepth = Math.max(decoyDepth, depth);
    }
    return { deadEnds, branches, deepBranches, decoyDepth };
  }
  function lengthenRoute(grid, links, solution, start, end, targetLength) {
    for (let iteration = 0; iteration < 12 && solution.length < targetLength; iteration++) {
      const routeIndex = new Int32Array(grid.mask.length).fill(-1);
      const owner = new Int32Array(grid.mask.length).fill(-1), depth = new Int32Array(grid.mask.length);
      const queue = solution.slice();
      solution.forEach((cell, index) => { routeIndex[cell] = index; owner[cell] = index; });
      for (let p = 0; p < queue.length; p++) for (let d = 0; d < 4; d++) if (links[queue[p]] & (1 << d)) {
        const next = grid.neighbor(queue[p], d);
        if (owner[next] === -1) { owner[next] = owner[queue[p]]; depth[next] = depth[queue[p]] + 1; queue.push(next); }
      }
      let best, bestScore = Infinity;
      for (const cell of grid.cells) if (routeIndex[cell] === -1) for (let d = 0; d < 4; d++) {
        const next = grid.neighbor(cell, d);
        if (next < 0 || routeIndex[next] === -1 || links[cell] & (1 << d) || owner[cell] === routeIndex[next]) continue;
        const gain = depth[cell] + 1 - Math.abs(owner[cell] - routeIndex[next]);
        if (gain <= 0 || gain > targetLength - solution.length + 2) continue;
        const score = Math.abs(targetLength - solution.length - gain);
        if (score < bestScore) { bestScore = score; best = { cell, next, dir: d, owner: owner[cell], nextIndex: routeIndex[next] }; }
      }
      if (!best) break;
      // Joining a side branch to the route creates one cycle. Removing a route
      // edge in that cycle keeps the whole maze connected with a unique solution.
      const from = solution[best.owner], to = solution[best.owner + Math.sign(best.nextIndex - best.owner)];
      const removeDir = [0, 1, 2, 3].find(d => grid.neighbor(from, d) === to);
      links[from] &= ~(1 << removeDir); links[to] &= ~(1 << ((removeDir + 2) % 4));
      links[best.cell] |= 1 << best.dir; links[best.next] |= 1 << ((best.dir + 2) % 4);
      solution = solve(grid, links, start, end);
    }
    return solution;
  }
  function generate(config, perPage = 2) {
    const shape = Shapes.byId[config.shape] || Shapes.byId.fish;
    const difficulty = Math.min(3, Math.max(0, Number(config.difficulty) || 0));
    if (Graph.supports(shape.id)) return Graph.generate({ ...config, shape: shape.id }, difficulty, DIFFICULTIES[difficulty], random, perPage);
    const resolution = resolutionFor(shape, difficulty, perPage);
    const grid = makeMask(shape, resolution), { start, end } = endpoints(grid);
    const targetLength = grid.cells.length * DIFFICULTIES[difficulty].ratio;
    const targetDecisions = [4, 8, 22, 48][difficulty];
    let best, bestScore = Infinity;
    for (let trial = 0; trial < 48; trial++) {
      const rng = random((Number(config.seed) + trial * 100003) >>> 0);
      // Entrance-rooted candidates lengthen the hardest routes even at the print resolution cap.
      const origin = difficulty === 3 ? start.cell : undefined;
      const links = carve(grid, rng, DIFFICULTIES[difficulty].tendency, origin);
      const { solution, decisions, turns } = routeStats(links, solve(grid, links, start, end));
      const turnShortfall = Math.max(0, targetLength * .55 - turns) / grid.cells.length;
      const detours = branchStats(grid, links, solution);
      const branchShortfall = difficulty >= 2 ? Math.max(0, grid.cells.length * .025 - detours.deepBranches) / grid.cells.length : 0;
      const score = branchShortfall * 4 + Math.abs(solution.length - targetLength) / grid.cells.length + (difficulty >= 2 ? Math.max(0, targetDecisions - decisions) : Math.abs(decisions - targetDecisions)) * .012 + turnShortfall * .15;
      if (score < bestScore) { bestScore = score; best = { links, solution, decisions, turns, ...detours }; }
    }
    if (difficulty === 3) {
      const target = Math.min(grid.cells.length * .66, best.solution.length * 1.2);
      Object.assign(best, routeStats(best.links, lengthenRoute(grid, best.links, best.solution, start, end, target)));
    }
    Object.assign(best, branchStats(grid, best.links, best.solution));
    const walls = [];
    for (const i of grid.cells) {
      const x = i % grid.cols, y = Math.floor(i / grid.cols);
      const segments = [[x, y, x + 1, y], [x + 1, y, x + 1, y + 1], [x, y + 1, x + 1, y + 1], [x, y, x, y + 1]];
      for (let d = 0; d < 4; d++) {
        if (best.links[i] & (1 << d)) continue;
        if ((start.cell === i && start.dir === d) || (end.cell === i && end.dir === d)) continue;
        const next = grid.neighbor(i, d);
        if (next < 0 || !grid.mask[next] || i < next) walls.push(segments[d]);
      }
    }
    const stars = [.25, .5, .75].map(t => best.solution[Math.floor((best.solution.length - 1) * t)]);
    return { ...grid, ...best, ...config, difficulty, shape: shape.id, resolution, start, end, walls, stars };
  }

  function validate(maze) {
    if (maze.topology) return Graph.validate(maze);
    const errors = [];
    let edges = 0;
    for (const i of maze.cells) for (let d = 0; d < 4; d++) if (maze.links[i] & (1 << d)) {
      const next = maze.neighbor(i, d);
      if (next < 0 || !maze.mask[next]) errors.push('通道越界');
      else if (!(maze.links[next] & (1 << ((d + 2) % 4)))) errors.push('通道不对称');
      edges++;
    }
    if (edges / 2 !== maze.cells.length - 1) errors.push('不满足唯一解的树结构');
    const reached = new Set([maze.start.cell]), queue = [maze.start.cell];
    for (let p = 0; p < queue.length; p++) for (let d = 0; d < 4; d++) if (maze.links[queue[p]] & (1 << d)) {
      const next = maze.neighbor(queue[p], d);
      if (next >= 0 && !reached.has(next)) { reached.add(next); queue.push(next); }
    }
    if (reached.size !== maze.cells.length) errors.push('存在孤立区域');
    for (const mark of [maze.start, maze.end]) {
      const next = maze.neighbor(mark.cell, mark.dir);
      if (next >= 0 && maze.mask[next]) errors.push('出入口未设在外边界');
    }
    for (let i = 1; i < maze.solution.length; i++) {
      const a = maze.solution[i - 1], b = maze.solution[i];
      if (![0, 1, 2, 3].some(d => maze.neighbor(a, d) === b && maze.links[a] & (1 << d))) errors.push('答案不连续');
    }
    if (new Set(maze.stars).size !== 3) errors.push('星星重叠');
    return { valid: !errors.length, errors: [...new Set(errors)], cells: maze.cells.length, edges: edges / 2 };
  }
  root.MazeEngine = { DIFFICULTIES, MODES, random, resolutionFor, makeMask, generate, validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MazeEngine;
})(typeof window !== 'undefined' ? window : globalThis);
