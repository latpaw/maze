'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Shapes = require('../js/shapes.js');
const Engine = require('../js/maze.js');

const SEEDS = [0, 17371, 0xffffffff];
// Baseline immediately before the requested difficulty increase, using the
// unchanged raster shapes at the UI's actual four-per-page generation density.
const BEFORE = [
  { length: 28.363333333333333, turns: 15.57 },
  { length: 46.54666666666667, turns: 29.06 },
  { length: 91.60333333333334, turns: 59.083333333333336 },
  { length: 150.33666666666667, turns: 96.68666666666667 },
];
const Graph = require('../js/graph-maze.js');

function measure(maze) {
  let turns = 0, decisions = 0;
  for (let index = 0; index < maze.solution.length; index++) {
    const cell = maze.solution[index];
    if (index >= 2 && cell - maze.solution[index - 1] !== maze.solution[index - 1] - maze.solution[index - 2]) turns++;
    let degree = 0;
    for (let direction = 0; direction < 4; direction++) if (maze.links[cell] & (1 << direction)) degree++;
    if (degree >= 3) decisions++;
  }
  return { length: maze.solution.length, turns, decisions, cells: maze.cells.length };
}

const averages = [0, 1, 2, 3].map(difficulty => {
  const totals = { length: 0, turns: 0, decisions: 0, cells: 0 };
  let count = 0;
  for (const shape of Shapes.shapes.filter(shape => !Graph.supports(shape.id))) for (const seed of SEEDS) {
    const maze = Engine.generate({ shape: shape.id, difficulty, seed, mode: 'collect' }, 4);
    const metrics = measure(maze);
    assert.equal(maze.turns, metrics.turns, `${shape.id}: reported turns do not match the final answer`);
    assert.equal(maze.decisions, metrics.decisions, `${shape.id}: reported decisions do not match the final answer`);
    for (const key of Object.keys(totals)) totals[key] += metrics[key];
    count++;
  }
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / count]));
});

test('every level has longer routes and more turns in the actual four-per-page layout', () => {
  for (let difficulty = 0; difficulty < 4; difficulty++) {
    const name = Engine.DIFFICULTIES[difficulty].name;
    for (const metric of ['length', 'turns']) {
      const growth = averages[difficulty][metric] / BEFORE[difficulty][metric];
      assert.ok(growth >= 1.03, `${name}: ${metric} only grew ${(100 * (growth - 1)).toFixed(1)}%, expected at least 3%`);

    }
  }
});

test('the four levels remain distinct in route length, turns and meaningful decisions', () => {
  for (let difficulty = 1; difficulty < 4; difficulty++) {
    assert.ok(averages[difficulty].length > averages[difficulty - 1].length * 1.3, `levels ${difficulty - 1}/${difficulty}: routes too similar`);
    assert.ok(averages[difficulty].turns > averages[difficulty - 1].turns * 1.3, `levels ${difficulty - 1}/${difficulty}: turns too similar`);
    assert.ok(averages[difficulty].decisions > averages[difficulty - 1].decisions, `levels ${difficulty - 1}/${difficulty}: decisions do not increase`);
  }
});

function branchMetrics(maze) {
  const neighbors = cell => [0, 1, 2, 3].filter(d => maze.links[cell] & (1 << d)).map(d => cell + [-maze.cols, 1, maze.cols, -1][d]);
  const route = new Set(maze.solution), depths = new Map(maze.solution.map(cell => [cell, 0]));
  const owners = new Map(), maxDepth = new Map(), queue = [...maze.solution];
  // Multi-source traversal gives each off-route cell its distance and the
  // first off-route cell it belongs to, independently of production DFS.
  for (let i = 0; i < queue.length; i++) for (const cell of neighbors(queue[i])) if (!depths.has(cell)) {
    const depth = depths.get(queue[i]) + 1, owner = route.has(queue[i]) ? cell : owners.get(queue[i]);
    depths.set(cell, depth); owners.set(cell, owner);
    maxDepth.set(owner, Math.max(maxDepth.get(owner) || 0, depth)); queue.push(cell);
  }
  const deadEnds = maze.cells.filter(cell => neighbors(cell).length === 1).length;
  const forks = maze.cells.filter(cell => neighbors(cell).length >= 3).length;
  const deepBranches = [...maxDepth.values()].filter(depth => depth >= 3).length;
  const decoyDepth = Math.max(0, ...maxDepth.values());
  assert.equal(maze.deadEnds, deadEnds, 'reported dead ends differ from actual links');
  assert.equal(maze.branches, forks, 'reported forks differ from actual links');
  assert.equal(maze.deepBranches, deepBranches, 'reported deep branches differ from actual links');
  assert.equal(maze.decoyDepth, decoyDepth, 'reported decoy depth differs from actual links');
  return { cells: maze.cells.length, length: maze.solution.length, forks, deadEnds, deepBranches };
}

// Captured from the previous four-per-page challenge generation over SEEDS.
const CHALLENGE_BEFORE = {
  square: { cells: 361, length: 277.6666666666667, deadEnds: 35 },
  fish: { cells: 195, length: 144.33333333333334, deadEnds: 27.333333333333332 },
  heart: { cells: 239, length: 195, deadEnds: 27.666666666666668 },
};
test('challenge has substantially denser passages, longer routes and more dead ends than the former challenge', () => {
  let challengeDeep = 0, advancedDeepTotal = 0;
  for (const [shape, before] of Object.entries(CHALLENGE_BEFORE)) {
    const samples = SEEDS.map(seed => branchMetrics(Engine.generate({ shape, difficulty: 3, seed, mode: 'classic' }, 4)));
    const mean = key => samples.reduce((sum, metrics) => sum + metrics[key], 0) / samples.length;
    assert.ok(mean('cells') >= before.cells * 3, `${shape}: challenge lacks the requested density`);
    assert.ok(mean('length') > before.length, `${shape}: challenge route did not grow with density`);
    assert.ok(mean('deadEnds') >= before.deadEnds * 2, `${shape}: not enough misleading dead ends`);
    // In a tree every fork contributes at least one extra leaf, so
    // previous fork count was at most (leaves - 2).
    assert.ok(mean('forks') >= 2 * (before.deadEnds - 2), `${shape}: not enough forks`);
    const advanced = SEEDS.map(seed => branchMetrics(Engine.generate({ shape, difficulty: 2, seed, mode: 'classic' }, 4)));
    const advancedDeep = advanced.reduce((sum, metrics) => sum + metrics.deepBranches, 0) / advanced.length;
    assert.ok(mean('deepBranches') > advancedDeep, `${shape}: challenge lacks deep wrong branches`);
    challengeDeep += mean('deepBranches'); advancedDeepTotal += advancedDeep;
  }
  assert.ok(challengeDeep >= advancedDeepTotal * 1.5, 'challenge must materially increase deep wrong branches across representative shapes');
});
