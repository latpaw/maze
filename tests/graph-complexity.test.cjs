'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/maze.js');
const Graph = require('../js/graph-maze.js');
const SEEDS = [0,17371,0xffffffff];
// Measured before density/frontier changes, four per A4 page, challenge level.
const BEFORE = {
  'slanted-hexagon': {cells:150,length:109.33333333333333,branches:13.666666666666666,deadEnds:15.666666666666666,deepBranches:4,decoyDepth:10.666666666666666},
  'slanted-triangle': {cells:121,length:89,branches:15.666666666666666,deadEnds:17.666666666666668,deepBranches:5,decoyDepth:5.666666666666667},
  'radial-circle': {cells:168,length:114.66666666666667,branches:19,deadEnds:21.666666666666668,deepBranches:5,decoyDepth:11.666666666666666}
};
function independentlyMeasure(maze) {
  const route = new Set(maze.solution);
  let deepBranches = 0, decoyDepth = 0;
  for (const cell of maze.solution) for (const next of maze.adjacency[cell]) {
    if (route.has(next.cell)) continue;
    const pending = [[next.cell,cell,1]];
    let deepest = 0;
    for (const [current,parent,depth] of pending) {
      deepest = Math.max(deepest,depth);
      for (const neighbor of maze.adjacency[current]) {
        if (neighbor.cell !== parent) pending.push([neighbor.cell,current,depth+1]);
      }
    }
    if (deepest >= 3) deepBranches++;
    decoyDepth = Math.max(decoyDepth,deepest);
  }
  return {
    cells:maze.cells.length,
    length:maze.solution.length,
    branches:maze.adjacency.filter(list=>list.length>=3).length,
    deadEnds:maze.adjacency.filter(list=>list.length===1).length,
    deepBranches,decoyDepth
  };
}

test('challenge layouts are denser with more forks, dead ends and deep decoys', () => {
  for (const shape of Object.keys(BEFORE)) {
    const totals = Object.fromEntries(Object.keys(BEFORE[shape]).map(key=>[key,0]));
    for (const seed of SEEDS) {
      const maze = Engine.generate({shape,difficulty:3,seed,mode:'classic'},4);
      assert.equal(Graph.validate(maze).valid,true);
      const metrics = independentlyMeasure(maze);
      for (const [key,value] of Object.entries(metrics)) {
        totals[key] += value / SEEDS.length;
        if (!['cells','length'].includes(key)) assert.equal(maze[key],value,`${shape}: ${key} metric`);
      }
    }
    assert.ok(totals.cells >= BEFORE[shape].cells*3,`${shape}: insufficient density`);
    assert.ok(totals.length >= BEFORE[shape].length*2,`${shape}: answer too short`);
    for (const key of ['branches','deadEnds','deepBranches','decoyDepth']) {
      assert.ok(totals[key] >= BEFORE[shape][key]*2,`${shape}: insufficient ${key}`);
    }
  }
});
