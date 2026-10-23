'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/maze.js');
const Document = require('../js/document.js');
const Geometry = require('../js/geometry.js');
const generate = (shape, id = shape) => Engine.generate({ shape, id, difficulty: 3, seed:17371, mode:'classic' },4);
function bounds(path) {
  // Bezier curves remain inside their control hull: including controls gives
  // a conservative bound without relying on the layout implementation.
  const coords = path.d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi).map(Number);
  const xs = coords.filter((_,i) => i%2===0), ys = coords.filter((_,i) => i%2===1), half = path.width/2;
  return { left:Math.min(...xs)-half, right:Math.max(...xs)+half, top:Math.min(...ys)-half, bottom:Math.max(...ys)+half };
}

test('tight layout enlarges a fixed maze relative to the former A4 margins', () => {
  for(const shape of ['square','fish','slanted-hexagon','slanted-triangle','radial-circle']) {
    const maze = generate(shape);
    const old = Geometry.projection(maze,{x:15,y:15,w:180,h:267},1.1,'straight').scale * (maze.cellSize||1);
    for(const perPage of [1,2,4,6]) {
      const scenes = Document.makeScenes([maze],{perPage,minimal:true,lineStyle:'straight'},true);
      assert.ok(scenes[0].mazeMetrics[0].cellSizeMM > old, `${shape}/${perPage}: fixed maze did not enlarge`);
      assert.deepEqual(scenes[0].mazeMetrics,scenes[1].mazeMetrics);
    }
  }
});

test('unused final row width expands its maze and answer by the same amount', () => {
  const mazes = Array.from({length:3},(_,i)=>generate('square',`square-${i}`));
  for(const minimal of [false,true]) {
    const [exercise,answer] = Document.makeScenes(mazes,{perPage:4,minimal,lineStyle:'straight'},true);
    assert.ok(exercise.mazeMetrics[2].cellSizeMM > exercise.mazeMetrics[0].cellSizeMM * 1.5);
    assert.deepEqual(exercise.mazeMetrics,answer.mazeMetrics);
    const walls = exercise.elements.filter(el=>el.stroke==='#272d29').map(bounds);
    assert.ok(walls[2].right-walls[2].left > (walls[0].right-walls[0].left)*1.5);
  }
});

test('wall drawings stay within A4 and remain separated across rows and columns', () => {
  const shapes = ['square','fish','slanted-triangle','radial-circle','slanted-hexagon','pineapple'];
  for(const perPage of [2,4,6]) for(const count of [perPage,perPage-1]) for(const minimal of [false,true]) for(const lineStyle of Geometry.STYLES) {
    const mazes = shapes.slice(0,count).map(shape=>generate(shape));
    const [exercise,answer] = Document.makeScenes(mazes,{perPage,minimal,lineStyle},true);
    assert.deepEqual(exercise.mazeMetrics,answer.mazeMetrics);
    const walls = exercise.elements.filter(el=>el.stroke==='#272d29').map(bounds);
    assert.equal(walls.length,count);
    for(const box of walls) assert.ok(box.left>=0 && box.right<=210 && box.top>=0 && box.bottom<=297);
    for(let i=0;i<walls.length;i++) for(let j=i+1;j<walls.length;j++) {
      const a=walls[i],b=walls[j];
      assert.ok(a.right+1<=b.left || b.right+1<=a.left || a.bottom+1<=b.top || b.bottom+1<=a.top,
        `overlap: layout=${perPage}, count=${count}, minimal=${minimal}, style=${lineStyle}, pair=${i}/${j}`);
    }
    const svg=Document.toSVG(exercise);
    for(const el of exercise.elements.filter(el=>el.stroke==='#272d29')) assert.ok(svg.includes(`d="${el.d}"`),'export must preserve the preview wall geometry');
  }
});
