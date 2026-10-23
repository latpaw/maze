'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Geometry = require('../js/geometry.js');
const Engine = require('../js/maze.js');
const Document = require('../js/document.js');

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

function endpointCounts(commands) {
  const counts = new Map();
  for (const points of flatten(commands)) {
    for (const point of [points[0], points[points.length - 1]]) {
      const key = point.join(',');
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

function assertWallMidpointsPreserved(walls, commands) {
  const segments = segmentsFromPaths(flatten(commands));
  for (const [x1, y1, x2, y2] of walls) {
    const midpoint = [(x1 + x2) / 2, (y1 + y2) / 2];
    assert.ok(segments.some(segment => pointSegmentDistance(midpoint, segment) < EPSILON), `wall omitted near ${midpoint}`);
  }
}

test('wall tracing preserves open ends, all three arms of T junctions, and every wall segment', () => {
  const walls = [[0, 1, 1, 1], [1, 1, 2, 1], [1, 1, 1, 0], [4, 0, 5, 0], [5, 0, 5, 1], [5, 1, 6, 1]];
  for (const style of ['rounded', 'curved']) {
    const commands = Geometry.wallCommands(walls, style), counts = endpointCounts(commands);
    for (const key of ['0,1', '2,1', '1,0', '4,0', '6,1']) assert.equal(counts.get(key), 1, `${style}: lost endpoint ${key}`);
    assert.equal(counts.get('1,1'), 3, `${style}: rounded away the shared T junction`);
    assert.equal(flatten(commands).length, 4);
    assertWallMidpointsPreserved(walls, commands);
    assert.equal(commands.filter(command => command[0] === 'C').length, 2);
  }
});

test('isolated wall loops close, while a loop attached to a T retains its junction', () => {
  const loop = [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]];
  for (const style of ['rounded', 'curved']) {
    const commands = Geometry.wallCommands(loop, style), paths = flatten(commands);
    assert.equal(paths.length, 1);
    assert.equal(commands.filter(command => command[0] === 'Z').length, 1);
    assert.equal(commands.filter(command => command[0] === 'C').length, 4);
    closePoint(paths[0][0], paths[0][paths[0].length - 1]);
    assertWallMidpointsPreserved(loop, commands);
    const attached = [...loop, [-1, 0, 0, 0]], joined = Geometry.wallCommands(attached, style);
    assert.equal(endpointCounts(joined).get('0,0'), 3, 'cycle and arm do not meet at the original junction');
    assert.equal(endpointCounts(joined).get('-1,0'), 1);
    assertWallMidpointsPreserved(attached, joined);
  }
  assert.deepEqual(Geometry.wallCommands([], 'curved'), []);
});

test('rounded corners are tangent cubic arcs, rather than angular line joins', () => {
  const commands = Geometry.roundedPolyline([[0, 0], [1, 0], [1, 1]], .2);
  const index = commands.findIndex(command => command[0] === 'C');
  assert.notEqual(index, -1);
  const entry = commands[index - 1].slice(1), curve = commands[index].slice(1);
  closePoint(entry, [.8, 0]);
  closePoint(curve.slice(4), [1, .2]);
  assert.ok(curve[0] > entry[0]);
  assert.equal(curve[1], entry[1], 'incoming tangent is not horizontal');
  assert.equal(curve[2], curve[4], 'outgoing tangent is not vertical');
  assert.ok(curve[3] < curve[5]);
  for (let step = 0; step <= 20; step++) {
    const point = cubicPoint(entry, curve, step / 20);
    assert.ok(Math.abs(distance(point, [.8, .2]) - .2) < .00008, 'corner is not a quarter-circle approximation');
  }
  const straight = Geometry.roundedPolyline([[0, 0], [1, 0], [1, 1]], 0);
  assert.equal(straight.some(command => command[0] === 'C'), false);
  assert.deepEqual(Geometry.roundedPolyline([], .2), []);
});

test('the curved projection is deterministic, remains orientation preserving, and keeps cells separated', () => {
  const cols = 21, rows = 19, padding = 2.6;
  const box = { x: 0, y: 0, w: cols + 2 * padding, h: rows + 2 * padding };
  for (const seed of [0, 1, 17371, 0xffffffff]) {
    const maze = { cols, rows, seed };
    const transform = Geometry.projection(maze, box, padding, 'curved');
    const repeat = Geometry.projection(maze, { ...box }, padding, 'curved');
    const straight = Geometry.projection(maze, box, padding, 'straight');
    assert.equal(transform.scale, 1);
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) {
      const point = transform.point([x, y]);
      closePoint(point, repeat.point([x, y]));
      const origin = straight.point([x, y]);
      assert.ok(Math.abs(point[0] - origin[0]) < .3 && Math.abs(point[1] - origin[1]) < .3, 'grid displacement consumes too much corridor space');
      const h = .0001, right = transform.point([x + h, y]), down = transform.point([x, y + h]);
      const finiteJacobian = cross(point, right, down) / (h * h);
      assert.ok(finiteJacobian > .97, `projection folds at ${x},${y}`);
      const horizontal = transform.vector([x, y], [1, 0]), vertical = transform.vector([x, y], [0, 1]);
      closePoint(horizontal, [(right[0] - point[0]) / h, (right[1] - point[1]) / h], .00001);
      closePoint(vertical, [(down[0] - point[0]) / h, (down[1] - point[1]) / h], .00001);
      if (x === cols || y === rows) continue;
      const corners = [point, transform.point([x + 1, y]), transform.point([x + 1, y + 1]), transform.point([x, y + 1])];
      for (let corner = 0; corner < 4; corner++) assert.ok(cross(corners[corner], corners[(corner + 1) % 4], corners[(corner + 2) % 4]) > .97, `cell ${x},${y} is inverted or nonconvex`);
      assert.equal(properCrossing([corners[0], corners[1]], [corners[2], corners[3]]), false);
      assert.equal(properCrossing([corners[1], corners[2]], [corners[3], corners[0]]), false);
    }
  }
  const a = Geometry.projection({ cols, rows, seed: 0 }, box, padding, 'curved');
  const b = Geometry.projection({ cols, rows, seed: 17371 }, box, padding, 'curved');
  assert.ok(distance(a.point([3, 4]), b.point([3, 4])) > .01, 'seed does not affect the warp');
});

function mazeSnapshot(maze) {
  return JSON.stringify({ cells: maze.cells, mask: [...maze.mask], links: [...maze.links], solution: maze.solution, walls: maze.walls, stars: maze.stars, start: maze.start, end: maze.end });
}

test('all line styles use the same projection for walls, answer and collection stars without changing topology', () => {
  const maze = Engine.generate({ id: 'geometry', shape: 'fish', difficulty: 3, seed: 17371, mode: 'collect' }, 4);
  const before = mazeSnapshot(maze);
  // The one-per-page minimal document uses a 6 mm margin and a .5 mm inset.
  const box = { x: 6.5, y: 6.5, w: 197, h: 284 };
  for (const style of Geometry.STYLES) {
    const transform = Geometry.projection(maze, box, 1.05, style);
    const scene = Document.makeScenes([maze], { perPage: 1, minimal: true, lineStyle: style }, true)[1];
    const wall = scene.elements.find(el => el.stroke === '#272d29');
    const answer = scene.elements.find(el => el.stroke === '#96b59a');
    assert.equal(wall.d, Geometry.project(Geometry.wallCommands(maze.walls, style), transform));
    const point = cell => [cell % maze.cols + .5, Math.floor(cell / maze.cols) + .5];
    const start = point(maze.start.cell), end = point(maze.end.cell);
    const points = [[start[0] - 1.25, start[1]], ...maze.solution.map(point), [end[0] + 1.25, end[1]]];
    assert.equal(answer.d, Geometry.project(Geometry.roundedPolyline(points, style === 'straight' ? 0 : .22), transform));
    const stars = scene.elements.filter(el => el.stroke === '#b07b31');
    assert.equal(stars.length, 3);
    stars.forEach((star, index) => {
      const tip = commandsFromPath(star.d)[0].slice(1), center = transform.point(point(maze.stars[index]));
      closePoint([tip[0], tip[1] + transform.scale * .29], center, .001);
    });
    assert.equal(mazeSnapshot(maze), before, `${style}: renderer changed the graph`);
    const svg = Document.toSVG(scene);
    const svgPaths = [...svg.matchAll(/\sd="([^"]*)"/g)].map(match => match[1]);
    assert.equal(svgPaths.some(value => value.includes('C')), style !== 'straight', `${style}: SVG cubic commands do not match selected style`);
  }
});

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

test('sampled cubic walls do not cross and their answer strokes retain clearance', () => {
  // Spatial bins keep this proportional to nearby geometry instead of comparing
  // every pair of samples. The samples include holes, narrow parts and corners.
  for (const shape of ['square', 'fish', 'cup', 'moon', 'elephant']) for (const seed of [0, 17371]) {
    const maze = Engine.generate({ shape, difficulty: 3, seed, mode: 'classic' }, 4);
    for (const style of Geometry.STYLES) {
      const label = `${shape}, seed=${seed}, style=${style}`;
      const scene = Document.makeScenes([maze], { perPage: 4, minimal: false, lineStyle: style }, true)[1];
      const wall = scene.elements.find(el => el.stroke === '#272d29'), answer = scene.elements.find(el => el.stroke === '#96b59a');
      const walls = segmentsFromPaths(flatten(commandsFromPath(wall.d))), answers = segmentsFromPaths(flatten(commandsFromPath(answer.d)));
      const size = scene.mazeMetrics[0].cellSizeMM / 2, bins = segmentBins(walls, size), checked = new Set();
      for (const candidates of bins.values()) for (let p = 0; p < candidates.length; p++) for (let q = p + 1; q < candidates.length; q++) {
        const a = Math.min(candidates[p], candidates[q]), b = Math.max(candidates[p], candidates[q]), key = `${a},${b}`;
        if (checked.has(key)) continue;
        checked.add(key);
        assert.equal(properCrossing(walls[a], walls[b]), false, `${label}: wall samples cross at segments ${a}/${b}`);
      }
      const clearance = (wall.width + answer.width) / 2;
      for (const segment of answers) {
        const candidates = new Set();
        const minX = Math.floor((Math.min(segment[0][0], segment[1][0]) - clearance) / size), maxX = Math.floor((Math.max(segment[0][0], segment[1][0]) + clearance) / size);
        const minY = Math.floor((Math.min(segment[0][1], segment[1][1]) - clearance) / size), maxY = Math.floor((Math.max(segment[0][1], segment[1][1]) + clearance) / size);
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) for (const index of bins.get(`${x},${y}`) || []) candidates.add(index);
        for (const index of candidates) assert.ok(segmentDistance(segment, walls[index]) > clearance + .01, `${label}: answer stroke touches a wall`);
      }
    }
  }
});

test('PDF export retains actual cubic operators for rounded and curved geometry', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = { fonts: { ready: Promise.resolve() } };
  try {
    const maze = Engine.generate({ shape: 'square', difficulty: 1, seed: 17371, mode: 'classic' }, 4);
    for (const style of Geometry.STYLES) {
      const scene = Document.makeScenes([maze], { perPage: 1, minimal: true, lineStyle: style }, true)[1];
      assert.equal(scene.elements.some(el => el.type === 'text'), false, 'fixture must not require browser fonts');
      const pdf = await (await Document.createPDF([scene])).text();
      const expected = scene.elements.reduce((count, el) => count + (el.type === 'path' ? (el.d.match(/C/g) || []).length : 0), 0);
      assert.equal((pdf.match(/ c\n/g) || []).length, expected, `${style}: PDF lost cubic controls`);
      assert.equal(expected > 0, style !== 'straight');
      assert.match(pdf, /^%PDF-1\.4/);
      assert.ok(!pdf.includes('NaN'));
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
