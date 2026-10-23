'use strict';
const assert = require('node:assert/strict');
function assertGraphMaze(maze, label = maze.shape) {
  const n = maze.cells.length;
  assert.ok(n >= 8, `${label}: too few cells`);
  assert.equal(maze.centers.length, n);
  assert.equal(maze.passages.length, maze.edges.length);
  const adjacency = Array.from({ length: n }, () => []);
  maze.edges.forEach(({ a, b }, edge) => {
    assert.ok(Number.isInteger(a) && a >= 0 && a < n && Number.isInteger(b) && b >= 0 && b < n && a !== b, `${label}: invalid edge`);
    assert.ok(maze.passages[edge] === 0 || maze.passages[edge] === 1);
    if (maze.passages[edge]) { adjacency[a].push({ cell: b, edge }); adjacency[b].push({ cell: a, edge }); }
  });
  assert.equal(maze.passages.reduce((sum, value) => sum + value, 0), n - 1, `${label}: not a tree`);
  adjacency.forEach((neighbors, cell) => assert.deepEqual([...maze.adjacency[cell]].sort((a,b) => a.edge-b.edge), neighbors.sort((a,b) => a.edge-b.edge), `${label}: inconsistent adjacency`));
  const parent = new Map([[maze.start.cell, null]]), queue = [maze.start.cell];
  for (let i = 0; i < queue.length; i++) for (const { cell } of adjacency[queue[i]]) if (!parent.has(cell)) { parent.set(cell, queue[i]); queue.push(cell); }
  assert.equal(parent.size, n, `${label}: disconnected`);
  const route = [];
  for (let cell = maze.end.cell; cell !== null; cell = parent.get(cell)) route.push(cell);
  assert.deepEqual(maze.solution, route.reverse(), `${label}: incorrect answer`);
  assert.notEqual(maze.start.index, maze.end.index);
  for (const mark of [maze.start, maze.end]) {
    assert.deepEqual(mark.commands, maze.boundary[mark.index].commands);
    assert.equal(mark.cell, maze.boundary[mark.index].cell);
    assert.ok(mark.outerPoint.every(Number.isFinite));
    assert.ok(Math.hypot(...mark.outerPoint.map((v,i) => v-mark.midpoint[i])) > 0);
  }
  const expected = maze.edges.flatMap((edge,i) => maze.passages[i] ? [] : edge.commands)
    .concat(maze.boundary.flatMap((wall,i) => [maze.start.index,maze.end.index].includes(i) ? [] : wall.commands));
  // Exact command comparison proves all retained walls and exactly two openings.
  assert.deepEqual(maze.wallCommands, expected, `${label}: drawn walls disagree with passages`);
  assert.deepEqual(maze.answerCommands[0], ['M', ...maze.start.outerPoint]);
  assert.deepEqual(maze.answerCommands.at(-1), ['L', ...maze.end.outerPoint]);
  assert.equal(maze.stars.length, 3);
  assert.equal(new Set(maze.stars).size, 3);
  maze.stars.forEach(cell => { assert.ok(maze.solution.includes(cell)); assert.notEqual(cell, maze.start.cell); assert.notEqual(cell, maze.end.cell); });
}
module.exports = { assertGraphMaze };
