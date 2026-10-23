'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/maze.js');
const Geometry = require('../js/geometry.js');
const Document = require('../js/document.js');
const { assertGraphMaze } = require('./graph-assertions.cjs');
const EPSILON = 1e-8;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const closePoint = (a, b, tolerance = EPSILON) => assert.ok(distance(a, b) <= tolerance, `points differ: ${a} / ${b}`);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function cubicPoint(from, values, t) {
  const u = 1 - t;
  return [0, 1].map(axis => u ** 3 * from[axis] + 3 * u * u * t * values[axis] + 3 * u * t * t * values[axis + 2] + t ** 3 * values[axis + 4]);
}

// The renderer only emits absolute M/L/C/Z. Parse independently so these
// checks exercise the actual serialized SVG paths, including cubic controls.
function commandsFromPath(value) {
  const tokens = value.match(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || [];
  const commands = [];
  for (let index = 0; index < tokens.length;) {
    const type = tokens[index++];
    assert.ok(['M', 'L', 'C', 'Z'].includes(type), `unsupported command ${type}`);
    const count = type === 'Z' ? 0 : type === 'C' ? 6 : 2;
    const values = tokens.slice(index, index + count).map(Number);
    assert.equal(values.length, count);
    assert.ok(values.every(Number.isFinite), 'invalid SVG coordinates');
    commands.push([type, ...values]);
    index += count;
  }
  return commands;
}

function flatten(commands, steps = 12) {
  const paths = [];
  let current, first, points;
  for (const [type, ...values] of commands) {
    if (type === 'M') {
      current = values;
      first = values;
      points = [values];
      paths.push(points);
    } else if (type === 'L') {
      points.push(values);
      current = values;
    } else if (type === 'C') {
      const from = current;
      for (let step = 1; step <= steps; step++) points.push(cubicPoint(from, values, step / steps));
      current = values.slice(4);
    } else if (type === 'Z') {
      points.push(first);
      current = first;
    }
  }
  return paths;
}

function segmentsFromPaths(paths) {
  return paths.flatMap(points => points.slice(1).map((point, index) => [points[index], point])).filter(([a, b]) => distance(a, b) > EPSILON);
}

function pointSegmentDistance(point, [a, b]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return distance(point, [a[0] + dx * t, a[1] + dy * t]);
}

function properCrossing([a, b], [c, d]) {
  return cross(a, b, c) * cross(a, b, d) < -EPSILON && cross(c, d, a) * cross(c, d, b) < -EPSILON;
}

function segmentDistance(a, b) {
  if (properCrossing(a, b)) return 0;
  return Math.min(pointSegmentDistance(a[0], b), pointSegmentDistance(a[1], b), pointSegmentDistance(b[0], a), pointSegmentDistance(b[1], a));
}

function segmentBins(segments, size) {
  const bins = new Map();
  segments.forEach((segment, index) => {
    const minX = Math.floor(Math.min(segment[0][0], segment[1][0]) / size), maxX = Math.floor(Math.max(segment[0][0], segment[1][0]) / size);
    const minY = Math.floor(Math.min(segment[0][1], segment[1][1]) / size), maxY = Math.floor(Math.max(segment[0][1], segment[1][1]) / size);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const key = `${x},${y}`;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(index);
    }
  });
  return bins;
}


const SHAPES = ['slanted-hexagon', 'slanted-triangle', 'radial-circle', 'hexagon', 'triangle', 'circle'];
test('special lattices and original shape IDs generate reproducible connected mazes with exactly one answer', () => {
  for (const shape of SHAPES) for (const seed of [0, 17371]) {
    const config = { shape, difficulty: 3, seed, mode: 'classic' };
    const maze = Engine.generate(config, 4);
    assert.ok(maze.topology, `${shape}: still uses square grid`);
    assertGraphMaze(maze, `${shape}/${seed}`);
    assert.deepEqual(Engine.generate(config, 4), maze, `${shape}: nondeterministic generation`);
  }
});

test('answers keep physical stroke clearance from all walls in every style', () => {
  for (const shape of SHAPES.slice(0,3)) for (const seed of [0,17371]) {
    const maze = Engine.generate({ shape, difficulty: 3, seed, mode: 'classic' },4);
    const before = JSON.stringify(maze);
    for (const style of Geometry.STYLES) {
      const label = `${shape}/${seed}/${style}`;
      const scene = Document.makeScenes([maze], { perPage:4, minimal:false, lineStyle:style },true)[1];
      const wall = scene.elements.find(el => el.stroke === '#272d29'), answer = scene.elements.find(el => el.stroke === '#96b59a');
      const walls = segmentsFromPaths(flatten(commandsFromPath(wall.d),24));
      const answers = segmentsFromPaths(flatten(commandsFromPath(answer.d),24));
      const clearance = (wall.width + answer.width)/2;
      const size = scene.mazeMetrics[0].cellSizeMM / 2, bins = segmentBins(walls,size);
      for (const segment of answers) {
        const candidates = new Set();
        const minX = Math.floor((Math.min(segment[0][0],segment[1][0])-clearance)/size), maxX = Math.floor((Math.max(segment[0][0],segment[1][0])+clearance)/size);
        const minY = Math.floor((Math.min(segment[0][1],segment[1][1])-clearance)/size), maxY = Math.floor((Math.max(segment[0][1],segment[1][1])+clearance)/size);
        for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) for(const i of bins.get(`${x},${y}`)||[]) candidates.add(i);
        for(const i of candidates) assert.ok(segmentDistance(segment,walls[i]) > clearance+.01, `${label}: answer stroke touches wall ${i}`);
      }
      assert.equal(JSON.stringify(maze),before,`${label}: rendering changed maze`);
    }
  }
});

test('polar cubic arcs survive SVG and PDF export in each style', async () => {
  const previous = globalThis.document;
  globalThis.document = { fonts: { ready: Promise.resolve() } };
  try {
    const maze = Engine.generate({ shape:'radial-circle',difficulty:3,seed:17371,mode:'classic' },4);
    for(const style of Geometry.STYLES) {
      const scene = Document.makeScenes([maze],{perPage:1,minimal:true,lineStyle:style},true)[1];
      assert.equal(scene.elements.some(el=>el.type==='text'),false);
      const expected = scene.elements.reduce((n,el)=>n+(el.type==='path'?(el.d.match(/C/g)||[]).length:0),0);
      assert.ok(expected>0,'circle arcs must remain cubic in straight style too');
      const svg = Document.toSVG(scene);
      assert.equal([...svg.matchAll(/\sd="([^"]*)"/g)].reduce((n, match) => n + (match[1].match(/C/g) || []).length, 0), expected);
      const pdf = await (await Document.createPDF([scene])).text();
      assert.equal((pdf.match(/ c\n/g)||[]).length,expected);
      assert.match(pdf,/^%PDF-1\.4/);
      assert.ok(!pdf.includes('NaN'));
    }
  } finally { if(previous===undefined) delete globalThis.document; else globalThis.document=previous; }
});

test('each geometric family has progressively longer routes through all four levels', () => {
  for (const shape of ['slanted-hexagon', 'slanted-triangle', 'radial-circle']) {
    const lengths = [0, 1, 2, 3].map(difficulty => [0, 17371, 0xffffffff].reduce((sum, seed) =>
      sum + Engine.generate({ shape, difficulty, seed, mode: 'classic' }, 4).solution.length, 0) / 3);
    for (let level = 1; level < lengths.length; level++) assert.ok(lengths[level] > lengths[level - 1] * 1.05,
      `${shape}: level ${level} does not produce a longer route`);
  }
});
