(function (root) {
  'use strict';
  const STYLES = ['straight', 'rounded', 'curved'];
  const normalizeStyle = style => STYLES.includes(style) ? style : 'curved';
  const n = value => Number(value.toFixed(3));

  function roundedPolyline(points, radius = .22, closed = false) {
    if (!points.length) return [];
    const commands = [];
    function corner(index) {
      const point = points[index], before = points[(index + points.length - 1) % points.length], after = points[(index + 1) % points.length];
      const inLength = Math.hypot(point[0] - before[0], point[1] - before[1]), outLength = Math.hypot(after[0] - point[0], after[1] - point[1]);
      if (!inLength || !outLength || !radius) return { entry: point, exit: point };
      const incoming = [(point[0] - before[0]) / inLength, (point[1] - before[1]) / inLength];
      const outgoing = [(after[0] - point[0]) / outLength, (after[1] - point[1]) / outLength];
      if (Math.abs(incoming[0] * outgoing[1] - incoming[1] * outgoing[0]) < .001) return { entry: point, exit: point };
      const r = Math.min(radius, inLength * .4, outLength * .4), k = .5522847498;
      const entry = [point[0] - incoming[0] * r, point[1] - incoming[1] * r];
      const exit = [point[0] + outgoing[0] * r, point[1] + outgoing[1] * r];
      return { entry, exit, curve: ['C', entry[0] + incoming[0] * r * k, entry[1] + incoming[1] * r * k, exit[0] - outgoing[0] * r * k, exit[1] - outgoing[1] * r * k, ...exit] };
    }
    const first = closed ? corner(0).entry : points[0];
    commands.push(['M', ...first]);
    const start = closed ? 0 : 1, end = closed ? points.length : points.length - 1;
    for (let i = start; i < end; i++) {
      const bend = corner(i);
      commands.push(['L', ...bend.entry]);
      if (bend.curve) commands.push(bend.curve);
    }
    commands.push(['L', ...(closed ? first : points[points.length - 1])]);
    if (closed) commands.push(['Z']);
    return commands;
  }

  function wallCommands(walls, style) {
    if (normalizeStyle(style) === 'straight') return walls.flatMap(([x1, y1, x2, y2]) => [['M', x1, y1], ['L', x2, y2]]);
    const nodes = new Map(), edges = walls.map(([x1, y1, x2, y2], index) => {
      const keys = [`${x1},${y1}`, `${x2},${y2}`];
      for (let i = 0; i < 2; i++) {
        if (!nodes.has(keys[i])) nodes.set(keys[i], { point: i ? [x2, y2] : [x1, y1], edges: [] });
        nodes.get(keys[i]).edges.push(index);
      }
      return keys;
    });
    const visited = new Uint8Array(edges.length), paths = [];
    function trace(firstEdge, startKey) {
      let edgeIndex = firstEdge, currentKey = startKey;
      const points = [nodes.get(startKey).point];
      while (!visited[edgeIndex]) {
        visited[edgeIndex] = 1;
        const edge = edges[edgeIndex], nextKey = edge[0] === currentKey ? edge[1] : edge[0], next = nodes.get(nextKey);
        points.push(next.point);
        if (nextKey === startKey || next.edges.length !== 2) break;
        currentKey = nextKey;
        edgeIndex = next.edges[0] === edgeIndex ? next.edges[1] : next.edges[0];
      }
      const last = points[points.length - 1];
      const closed = nodes.get(startKey).edges.length === 2 && last[0] === points[0][0] && last[1] === points[0][1];
      if (closed) points.pop();
      paths.push(...roundedPolyline(points, style === 'rounded' ? .22 : .25, closed));
    }
    // Only round uninterrupted walls; all T-junctions keep their shared endpoint.
    for (const [key, node] of nodes) if (node.edges.length !== 2) for (const edge of node.edges) if (!visited[edge]) trace(edge, key);
    for (let i = 0; i < edges.length; i++) if (!visited[i]) trace(i, edges[i][0]);
    return paths;
  }

  function projection(maze, box, padding, style) {
    if (maze.topology) {
      const scale = Math.min(box.w / (maze.cols + padding * 2), box.h / (maze.rows + padding * 2));
      const ox = box.x + (box.w - maze.cols * scale) / 2, oy = box.y + (box.h - maze.rows * scale) / 2;
      return { scale, point: ([x, y]) => [ox + scale * x, oy + scale * y],
        vector: (_, [dx, dy]) => [scale * dx, scale * dy], curved: false };
    }
    const curved = normalizeStyle(style) === 'curved';
    const scale = Math.min(box.w / (maze.cols + padding * 2), box.h / (maze.rows + padding * 2));
    const ox = box.x + (box.w - maze.cols * scale) / 2, oy = box.y + (box.h - maze.rows * scale) / 2;
    const seed = Number(maze.seed) >>> 0, phaseX = (seed % 10007) / 10007 * Math.PI * 2, phaseY = ((seed >>> 8) % 10009) / 10009 * Math.PI * 2;
    // The displacement derivative stays below .16, keeping the warped grid one-to-one.
    const point = ([x, y]) => [ox + scale * (x + (curved ? .28 * Math.sin(y * .55 + phaseY) : 0)), oy + scale * (y + (curved ? .26 * Math.sin(x * .5 + phaseX) : 0))];
    const vector = ([x, y], [dx, dy]) => [scale * (dx + (curved ? .154 * Math.cos(y * .55 + phaseY) * dy : 0)), scale * (dy + (curved ? .13 * Math.cos(x * .5 + phaseX) * dx : 0))];
    return { scale, point, vector, curved };
  }

  function project(commands, transform) {
    const result = [];
    let current = [0, 0];
    const coords = point => point.map(n).join(' ');
    for (const command of commands) {
      const [type, ...values] = command;
      if (type === 'Z') { result.push('Z'); continue; }
      if (type === 'M') { current = values; result.push('M' + coords(transform.point(values))); continue; }
      const end = type === 'C' ? values.slice(4) : values;
      if (type === 'C' || transform.curved) {
        const from = transform.point(current), to = transform.point(end);
        const first = type === 'C' ? values.slice(0, 2) : current.map((value, i) => value + (end[i] - value) / 3);
        const second = type === 'C' ? values.slice(2, 4) : end.map((value, i) => value - (end[i] - current[i]) / 3);
        const tangent1 = transform.vector(current, first.map((value, i) => value - current[i]));
        const tangent2 = transform.vector(end, second.map((value, i) => value - end[i]));
        result.push('C' + coords(from.map((value, i) => value + tangent1[i])) + ' ' + coords(to.map((value, i) => value + tangent2[i])) + ' ' + coords(to));
      } else result.push('L' + coords(transform.point(end)));
      current = end;
    }
    return result.join('');
  }
  const api = { STYLES, normalizeStyle, roundedPolyline, wallCommands, projection, project };
  root.MazeGeometry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
