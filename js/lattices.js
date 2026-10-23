(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MazeLattices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const point = (r, a, c) => [c + r * Math.cos(a), c + r * Math.sin(a)];
  function arc(r, start, end, c) {
    const commands = [];
    const count = Math.max(1, Math.ceil(Math.abs(end - start) / (Math.PI / 4)));
    for (let i = 0; i < count; i++) {
      const a = start + (end - start) * i / count;
      const b = start + (end - start) * (i + 1) / count;
      const k = 4 / 3 * Math.tan((b - a) / 4);
      const p = point(r, a, c), q = point(r, b, c);
      if (!i) commands.push(['M', ...p]);
      commands.push(['C', p[0] - k * r * Math.sin(a), p[1] + k * r * Math.cos(a),
        q[0] + k * r * Math.sin(b), q[1] - k * r * Math.cos(b), ...q]);
    }
    return commands;
  }
  function triangular(shape, resolution) {
    const h = Math.sqrt(3);
    const hex = shape === 'hexagon' || shape === 'slanted-hexagon';
    const n = Math.max(3, Math.round(resolution / (hex ? 4 : 2)));
    const cols = hex ? 4 * n : 2 * n, rows = hex ? 2 * h * n : h * n;
    const polygon = hex ? [[0,h*n],[n,0],[3*n,0],[4*n,h*n],[3*n,2*h*n],[n,2*h*n]] : [[0,0],[2*n,0],[n,h*n]];
    const inside = p => polygon.every((a,i) => {
      const b = polygon[(i+1)%polygon.length];
      return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]) >= -1e-7;
    });
    const cells = [], centers = [], edges = [], boundary = [];
    const walls = new Map();
    function add(vertices) {
      const center = [vertices.reduce((s,p)=>s+p[0],0)/3,vertices.reduce((s,p)=>s+p[1],0)/3];
      if (!inside(center)) return;
      const cell = cells.length;
      cells.push(cell);
      centers.push(center);
      vertices.forEach((p,i)=> {
        const q=vertices[(i+1)%3];
        const key=[p,q].map(v=>v.map(x=>x.toFixed(7)).join(',')).sort().join(':');
        const existing=walls.get(key);
        if (existing) {
          edges.push({a: existing.cell, b: cell, commands: existing.commands, midpoint: existing.midpoint});
          walls.delete(key);
        }
        else {
          const midpoint=[(p[0]+q[0])/2,(p[1]+q[1])/2];
          const length=Math.hypot(midpoint[0]-center[0],midpoint[1]-center[1]);
          walls.set(key,{cell,commands:[['M',...p],['L',...q]],midpoint,normal:[(midpoint[0]-center[0])/length,(midpoint[1]-center[1])/length],outer:true});
        }
      });
    }
    // Hexagon corners must align with the alternating lattice vertex parity.
    const offsetX = hex ? n % 2 : 0;
    for (let j = 0; j < (hex ? 2 * n : n); j++) {
      for (let i = -2 * n; i < 2 * n; i++) {
        const p = [2 * i + j + offsetX, h * j];
        const q = [2 * i + j + 2 + offsetX, h * j];
        const r = [2 * i + j + 1 + offsetX, h * (j + 1)];
        const s = [2 * i + j + 3 + offsetX, h * (j + 1)];
        add([p, q, r]);
        add([q, s, r]);
      }
    }
    boundary.push(...walls.values());
    // The construction above uses a downward triangle; reflect its geometry so
    // the printed outline has the apex at the top, as in the reference.
    if (!hex) {
      centers.forEach(center => { center[1] = rows - center[1]; });
      [...edges, ...boundary].forEach(wall => {
        wall.commands.forEach(command => { command[2] = rows - command[2]; });
        wall.midpoint[1] = rows - wall.midpoint[1];
        if (wall.normal) wall.normal[1] *= -1;
      });
    }
    return {kind:'triangular',cols,rows,cells,centers,edges,boundary,cellSize:2/Math.sqrt(3)};
  }
  function polar(resolution) {
    const rings = Math.max(4, Math.round(resolution / 2) - 2);
    const radius = rings + 2, c = radius;
    const cells = [], centers = [], edges = [], boundary = [];
    const meta = [], levels = [];
    let sectors=12;
    for(let ring=0;ring<rings;ring++) {
      const inner=ring+2, outer=inner+1, mid=(inner+outer)/2;
      // Delay sector doubling until each new inner-edge chord is at least
      // the unit radial corridor width represented by cellSize.
      while(TAU*mid/sectors>2.1) sectors*=2;
      const level=[];
      for(let sector=0;sector<sectors;sector++) {
        const id=cells.length, start=TAU*sector/sectors, end=TAU*(sector+1)/sectors;
        cells.push(id);
        level.push(id);
        centers.push(point(mid, (start + end) / 2, c));
        meta.push({inner,outer,mid,start,end,ring});
      }
      levels.push(level);
    }
    levels.forEach((level, ring) => level.forEach((id, index) => {
      const cell = meta[id];
      const start = point(cell.inner, cell.end, c);
      const end = point(cell.outer, cell.end, c);
      edges.push({
        a: id,
        b: level[(index + 1) % level.length],
        commands: [['M', ...start], ['L', ...end]],
        midpoint: point(cell.mid, cell.end, c)
      });
      const middleAngle = (cell.start + cell.end) / 2;
      if (ring) {
        const previous = levels[ring - 1];
        const parent = previous[Math.floor(index * previous.length / level.length)];
        edges.push({
          a: parent,
          b: id,
          commands: arc(cell.inner, cell.start, cell.end, c),
          midpoint: point(cell.inner, middleAngle, c)
        });
      } else {
        boundary.push({
          cell: id,
          commands: arc(cell.inner, cell.start, cell.end, c),
          midpoint: point(cell.inner, middleAngle, c),
          normal: [-Math.cos(middleAngle), -Math.sin(middleAngle)],
          outer: false
        });
      }
      if (ring === rings - 1) {
        boundary.push({
          cell: id,
          commands: arc(cell.outer, cell.start, cell.end, c),
          midpoint: point(cell.outer, middleAngle, c),
          normal: [Math.cos(middleAngle), Math.sin(middleAngle)],
          outer: true
        });
      }
    }));
    return {kind:'polar',cols:radius*2,rows:radius*2,cells,centers,edges,boundary,cellSize:1,polarCells:meta};
  }
  function routeBetween(grid,a,b) {
    if(grid.kind!=='polar') return [['M',...grid.centers[a]],['L',...grid.centers[b]]];
    const ma=grid.polarCells[a],mb=grid.polarCells[b],c=grid.cols/2;
    const aa=(ma.start+ma.end)/2, ab=(mb.start+mb.end)/2;
    if(ma.ring===mb.ring) {
      let delta = ab - aa;
      if (delta > Math.PI) delta -= TAU;
      if (delta < -Math.PI) delta += TAU;
      return arc(ma.mid,aa,aa+delta,c);
    }
    // At a sector split, the child midpoint remains inside its parent sector.
    // Turn at each ring midpoint before crossing radially through the opening.
    const child=ma.ring>mb.ring?ma:mb;
    const angle=(child.start+child.end)/2;
    const result=arc(ma.mid,aa,angle,c);
    result.push(['L',...point(mb.mid,angle,c)]);
    result.push(...arc(mb.mid,angle,ab,c).slice(1));
    return result;
  }
  function build(shapeId,resolution) {
    if(['slanted-hexagon','slanted-triangle','hexagon','triangle'].includes(shapeId)) return triangular(shapeId,resolution);
    if(['radial-circle','circle'].includes(shapeId)) return polar(resolution);
    return null;
  }
  return {build,routeBetween,arc};
});
