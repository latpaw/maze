const test = require('node:test');
const assert = require('node:assert/strict');
const {build,routeBetween} = require('../js/lattices.js');
for (const shape of ['slanted-hexagon','slanted-triangle','radial-circle']) {
  test(`${shape} is a connected tessellation with finite safe routes`, () => {
    const g=build(shape,24), adjacency=g.cells.map(()=>[]);
    for(const e of g.edges) {
      adjacency[e.a].push(e.b);adjacency[e.b].push(e.a);
      assert.ok(routeBetween(g,e.a,e.b).every(c=>c.slice(1).every(Number.isFinite)));
      assert.ok(routeBetween(g,e.b,e.a).every(c=>c.slice(1).every(Number.isFinite)));
    }
    const seen=new Set([0]),queue=[0];
    for(const a of queue) for(const b of adjacency[a]) if(!seen.has(b)){seen.add(b);queue.push(b);}
    assert.equal(seen.size,g.cells.length);
    for(const b of g.boundary) assert.ok(Math.abs(Math.hypot(...b.normal)-1)<1e-9);
    if(g.kind==='triangular') {
      assert.equal(g.cells.length,shape==='slanted-hexagon'?216:144);
      assert.equal(g.cells.length*3,g.edges.length*2+g.boundary.length);
      for(const e of [...g.edges,...g.boundary]) {
        const [p,q]=e.commands;const dx=q[1]-p[1],dy=q[2]-p[2];
        assert.ok(Math.abs(dy)<1e-9 || Math.abs(Math.abs(dy/dx)-Math.sqrt(3))<1e-9);
      }
    } else {
      assert.ok(g.boundary.some(b=>!b.outer));
      assert.ok(g.boundary.some(b=>b.outer));
      assert.ok(g.edges.some(e=>e.commands.some(c=>c[0]==='C')));
      for (const m of g.polarCells) {
        assert.ok((m.end - m.start) * m.mid <= 2.1);
        const innerChord = 2 * m.inner * Math.sin((m.end - m.start) / 2);
        assert.ok(innerChord >= g.cellSize, 'inner sector opening preserves the declared corridor width');
        assert.ok(m.outer - m.inner >= g.cellSize);
      }
      for(let r=0;r<10;r++) {
        const ring=g.polarCells.map((m,i)=>({m,i})).filter(x=>x.m.ring===r);
        const first=ring[0].i,last=ring.at(-1).i;
        assert.ok(adjacency[first].includes(last),'angular wrap must connect');
        const route=routeBetween(g,last,first);
        assert.ok(route.length<=3,'wrap route must take the short arc');
      }
    }
  });
}

test('triangle outline has a top apex and a horizontal bottom base', () => {
  const grid = build('slanted-triangle', 24);
  const vertices = grid.boundary.flatMap(wall => wall.commands.map(command => command.slice(1)));
  const apex = vertices.filter(point => Math.abs(point[1]) < 1e-9);
  assert.ok(apex.length > 0);
  assert.ok(apex.every(point => Math.abs(point[0] - grid.cols / 2) < 1e-9));
  assert.ok(vertices.some(point => Math.abs(point[0]) < 1e-9 && Math.abs(point[1] - grid.rows) < 1e-9));
  assert.ok(vertices.some(point => Math.abs(point[0] - grid.cols) < 1e-9 && Math.abs(point[1] - grid.rows) < 1e-9));
  for (const wall of grid.boundary) {
    const center = grid.centers[wall.cell];
    assert.ok((wall.midpoint[0] - center[0]) * wall.normal[0] +
      (wall.midpoint[1] - center[1]) * wall.normal[1] > 0);
  }
});

test('routes across polar sector splits stay inside the adjacent cells', () => {
  const grid = build('radial-circle', 32);
  const c = grid.cols / 2;
  let splits = 0;
  for (const edge of grid.edges) {
    const parent = grid.polarCells[edge.a], child = grid.polarCells[edge.b];
    if (parent.ring + 1 !== child.ring || parent.end - parent.start < 1.5 * (child.end - child.start)) continue;
    splits++;
    for (const [a,b] of [[edge.a,edge.b],[edge.b,edge.a]]) {
      let current;
      for (const command of routeBetween(grid,a,b)) {
        if (command[0] === 'M') { current = command.slice(1); continue; }
        const start = current;
        const end = command.slice(-2);
        for (let step = 0; step <= 40; step++) {
          const t = step / 40, u = 1 - t;
          const p = command[0] === 'L'
            ? start.map((v,i) => u*v + t*end[i])
            : start.map((v,i) => u*u*u*v + 3*u*u*t*command[1+i] + 3*u*t*t*command[3+i] + t*t*t*end[i]);
          const radius = Math.hypot(p[0]-c,p[1]-c);
          let angle = Math.atan2(p[1]-c,p[0]-c);
          if(angle < 0) angle += Math.PI*2;
          const contains = cell => radius >= cell.inner-1e-7 && radius <= cell.outer+1e-7 &&
            angle >= cell.start-1e-7 && angle <= cell.end+1e-7;
          assert.ok(contains(parent) || contains(child), 'route crosses no unrelated cell');
        }
        current = end;
      }
    }
  }
  assert.ok(splits > 0);
});

test('hexagon boundary follows its six exact sides at odd and even lattice sizes', () => {
  for (const resolution of [15,19,20,24,29]) {
    const grid = build('slanted-hexagon', resolution);
    const n = grid.cols / 4, h = Math.sqrt(3);
    const corners = [[0,h*n],[n,0],[3*n,0],[4*n,h*n],[3*n,2*h*n],[n,2*h*n]];
    const onSegment = (p,a,b) => {
      const cross = (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]);
      const projection = (p[0]-a[0])*(b[0]-a[0]) + (p[1]-a[1])*(b[1]-a[1]);
      const lengthSquared = (b[0]-a[0])**2 + (b[1]-a[1])**2;
      return Math.abs(cross)<1e-7 && projection>=-1e-7 && projection<=lengthSquared+1e-7;
    };
    assert.equal(grid.cells.length,6*n*n);
    assert.equal(grid.boundary.length,6*n);
    for (const wall of grid.boundary) {
      const endpoints = wall.commands.map(command => command.slice(1));
      assert.ok(corners.some((a,i) => endpoints.every(p => onSegment(p,a,corners[(i+1)%6]))),
        `boundary segment must lie on an exact hexagon side at resolution ${resolution}`);
    }
  }
});
