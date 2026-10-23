(function (root) {
  'use strict';
  const Lattices = root.MazeLattices || (typeof require === 'function' ? require('./lattices.js') : null);
  const supports = id => ['slanted-hexagon', 'slanted-triangle', 'radial-circle', 'hexagon', 'triangle', 'circle'].includes(id);
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function stats(grid, adjacency, solution) {
    let turns = 0;
    for (let i = 2; i < solution.length; i++) {
      const [a, b, c] = solution.slice(i - 2, i + 1).map(cell => grid.centers[cell]);
      const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
      if (dot / (distance(a, b) * distance(b, c)) < .999999) turns++;
    }
    const route = new Set(solution);
    let deepBranches = 0, decoyDepth = 0;
    // Every off-route subtree attaches exactly once in a perfect maze. Count
    // tempting detours only when they lead at least three cells away.
    for (const cell of solution) for (const next of adjacency[cell]) {
      if (route.has(next.cell)) continue;
      const pending = [[next.cell, cell, 1]];
      let depth = 0;
      for (const [current, parent, level] of pending) {
        depth = Math.max(depth, level);
        for (const neighbor of adjacency[current]) {
          if (neighbor.cell !== parent) pending.push([neighbor.cell, current, level + 1]);
        }
      }
      if (depth >= 3) deepBranches++;
      decoyDepth = Math.max(decoyDepth, depth);
    }
    return {
      turns,
      decisions: solution.filter(cell => adjacency[cell].length >= 3).length,
      branches: adjacency.filter(list => list.length >= 3).length,
      deadEnds: adjacency.filter(list => list.length === 1).length,
      deepBranches,
      decoyDepth
    };
  }
  function solve(adjacency, start, end) {
    const parents = new Int32Array(adjacency.length).fill(-1), queue = [start];
    parents[start] = start;
    for (let p = 0; p < queue.length; p++) for (const { cell } of adjacency[queue[p]]) if (parents[cell] === -1) {
      parents[cell] = queue[p]; queue.push(cell);
    }
    if (parents[end] === -1) throw new Error('迷宫没有连通');
    const route = [end];
    while (route[route.length - 1] !== start) route.push(parents[route[route.length - 1]]);
    return route.reverse();
  }
  function generate(config, difficulty, settings, random, perPage) {
    const space = perPage >= 4 ? [94, 92] : perPage === 2 ? [193, 98] : [193, 228];
    let resolution = settings.size, grid;
    // Fit the actual cell clearance, including triangular inradii and polar rings.
    do {
      grid = Lattices.build(config.shape, resolution);
      if (Math.min(space[0] / (grid.cols + 2.4), space[1] / (grid.rows + 2.4)) * grid.cellSize >= (settings.minCell || 3.4) || resolution <= 8) break;
      resolution--;
    } while (true);
    const neighbors = grid.cells.map(() => []);
    grid.edges.forEach(({ a, b }, edge) => { neighbors[a].push({ cell: b, edge }); neighbors[b].push({ cell: a, edge }); });
    const exterior = grid.boundary.map((wall, index) => ({ ...wall, index })).filter(wall => wall.outer);
    const start = grid.kind === 'polar'
      ? exterior.reduce((best, wall) => wall.midpoint[1] < best.midpoint[1] ? wall : best)
      : exterior.reduce((best, wall) => wall.midpoint[0] < best.midpoint[0] ? wall : best);
    const goals = grid.kind === 'polar'
      ? grid.boundary.map((wall, index) => ({ ...wall, index })).filter(wall => !wall.outer)
      : exterior.filter(wall => wall.midpoint[0] >= grid.cols * .72);
    if (!goals.length) throw new Error('迷宫缺少出口边界');
    let best, bestScore = Infinity;
    for (let trial = 0; trial < 64; trial++) {
      const rng = random((Number(config.seed) + trial * 100003) >>> 0);
      const passages = new Uint8Array(grid.edges.length), seen = new Uint8Array(grid.cells.length);
      const origin = difficulty >= 2 ? start.cell : Math.floor(rng() * grid.cells.length), active = [origin];
      // Vary frontier persistence between candidates. Occasional recent/random
      // frontier restarts create forks while long depth-first runs retain winding.
      const tendency = difficulty >= 2
        ? Math.min(.985, settings.tendency + (trial % 5 - 2) * .03)
        : settings.tendency;
      seen[origin] = 1;
      while (active.length) {
        const index = rng() < tendency ? active.length - 1
          : trial % 2 ? Math.floor(rng() * active.length)
            : Math.max(0, active.length - 1 - Math.floor(rng() * Math.min(active.length, 24)));
        const current = active[index], choices = neighbors[current].filter(next => !seen[next.cell]);
        if (!choices.length) { active.splice(index, 1); continue; }
        const next = choices[Math.floor(rng() * choices.length)];
        passages[next.edge] = 1; seen[next.cell] = 1; active.push(next.cell);
      }
      const adjacency = neighbors.map(list => list.filter(next => passages[next.edge]));
      // Choose an exit on the opposite boundary (or inner circle) with a long route.
      const end = goals[Math.floor(rng() * goals.length)];
      const solution = solve(adjacency, start.cell, end.cell), metrics = stats(grid, adjacency, solution);
      const count = grid.cells.length;
      const score = Math.abs(solution.length / count - settings.ratio)
        + Math.max(0, [.025, .04, .045, .055][difficulty] - metrics.decisions / count) * 2
        + Math.max(0, [.08, .09, .10, .11][difficulty] - metrics.deadEnds / count)
        + Math.max(0, [.008, .012, .018, .023][difficulty] - metrics.deepBranches / count) * 4
        - Math.min(metrics.decoyDepth / count, .06) * .2;
      if (score < bestScore) { bestScore = score; best = { passages, adjacency, solution, end, ...metrics }; }
    }
    const marks = [start, best.end].map(mark => ({ ...mark,
      outerPoint: mark.midpoint.map((value, axis) => value + mark.normal[axis] * .65),
    }));
    const wallCommands = grid.edges.flatMap((edge, index) => best.passages[index] ? [] : edge.commands)
      .concat(grid.boundary.flatMap((wall, index) => marks.some(mark => mark.index === index) ? [] : wall.commands));
    const answerCommands = [['M', ...marks[0].outerPoint], ['L', ...marks[0].midpoint], ['L', ...grid.centers[start.cell]]];
    for (let i = 1; i < best.solution.length; i++) answerCommands.push(...Lattices.routeBetween(grid, best.solution[i - 1], best.solution[i]).slice(1));
    answerCommands.push(['L', ...marks[1].midpoint], ['L', ...marks[1].outerPoint]);
    return { ...config, ...grid, ...best, topology: grid.kind, difficulty, resolution, start: marks[0], end: marks[1],
      wallCommands, answerCommands, walls: [], stars: [.25, .5, .75].map(t => best.solution[Math.floor((best.solution.length - 1) * t)]) };
  }
  function validate(maze) {
    const errors = [], count = maze.cells.length;
    const passages = maze.edges.filter((edge, i) => maze.passages[i]);
    if (passages.length !== count - 1) errors.push('不满足唯一解的树结构');
    const reached = new Set([maze.start.cell]), queue = [maze.start.cell];
    for (let p = 0; p < queue.length; p++) for (const { cell } of maze.adjacency[queue[p]]) if (!reached.has(cell)) { reached.add(cell); queue.push(cell); }
    if (reached.size !== count) errors.push('存在孤立区域');
    for (let i = 1; i < maze.solution.length; i++) if (!maze.adjacency[maze.solution[i - 1]].some(next => next.cell === maze.solution[i])) errors.push('答案不连续');
    for (const mark of [maze.start, maze.end]) if (maze.boundary[mark.index]?.cell !== mark.cell) errors.push('出入口未设在边界');
    if (new Set(maze.stars).size !== 3 || maze.stars.some(cell => !maze.solution.includes(cell))) errors.push('星星位置错误');
    return { valid: !errors.length, errors: [...new Set(errors)], cells: count, edges: passages.length };
  }
  const api = { supports, generate, validate };
  root.MazeGraph = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
