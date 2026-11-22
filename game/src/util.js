// util.js - shared helpers for Neon Harbor: Vice Run.
// Seeded RNG, math shortcuts, and small geometry/collision helpers used by
// every other module. Everything hangs off the NH namespace so the classic
// scripts can load in any order after this one.
window.NH = window.NH || {};

NH.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
NH.lerp = function (a, b, t) { return a + (b - a) * t; };
NH.dist2 = function (ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
NH.dist = function (ax, az, bx, bz) { return Math.sqrt(NH.dist2(ax, az, bx, bz)); };

// Angle helpers: headings are radians, 0 faces +Z, positive turns toward +X.
NH.angleLerp = function (a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * NH.clamp(t, 0, 1);
};
NH.angleTo = function (ax, az, bx, bz) { return Math.atan2(bx - ax, bz - az); };

// Deterministic RNG (mulberry32) so ?seed= makes staged scenes repeatable.
NH.makeRng = function (seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
NH.rng = NH.makeRng(1);
NH.rand = function (lo, hi) { return lo + NH.rng() * (hi - lo); };
NH.randInt = function (lo, hi) { return Math.floor(NH.rand(lo, hi + 1)); };
NH.pick = function (arr) { return arr[Math.floor(NH.rng() * arr.length) % arr.length]; };

// Circle vs axis-aligned box: returns a push-out vector {x,z,depth} or null.
NH.circleVsBox = function (cx, cz, r, box) {
  const nx = NH.clamp(cx, box.minX, box.maxX);
  const nz = NH.clamp(cz, box.minZ, box.maxZ);
  const dx = cx - nx, dz = cz - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 > r * r) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    return { x: dx / d, z: dz / d, depth: r - d };
  }
  // Centre inside the box: push out along the smallest penetration axis.
  const left = cx - box.minX, right = box.maxX - cx;
  const top = cz - box.minZ, bottom = box.maxZ - cz;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: -1, z: 0, depth: left + r };
  if (m === right) return { x: 1, z: 0, depth: right + r };
  if (m === top) return { x: 0, z: -1, depth: top + r };
  return { x: 0, z: 1, depth: bottom + r };
};

// Ray (2D, on the ground plane) vs box: returns distance along ray or Infinity.
NH.rayVsBox2D = function (ox, oz, dx, dz, box) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-8) { if (ox < box.minX || ox > box.maxX) return Infinity; }
  else {
    let t1 = (box.minX - ox) / dx, t2 = (box.maxX - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-8) { if (oz < box.minZ || oz > box.maxZ) return Infinity; }
  else {
    let t1 = (box.minZ - oz) / dz, t2 = (box.maxZ - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
};

// Merge indexed BufferGeometries that share the same attributes into one
// geometry, keeping each source's baked transform and UVs. Round 3 uses
// this to collapse static city geometry and repeated car parts into single
// draw calls.
NH.mergeGeos = function (geos) {
  let vTotal = 0, iTotal = 0;
  for (const g of geos) {
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geos[0].attributes)) {
    const a0 = geos[0].attributes[name];
    const arr = new a0.array.constructor(vTotal * a0.itemSize);
    let off = 0;
    for (const g of geos) {
      const a = g.attributes[name];
      arr.set(a.array, off * a0.itemSize);
      off += a.count;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, a0.itemSize));
  }
  const idx = new (vTotal > 65535 ? Uint32Array : Uint16Array)(iTotal);
  let io = 0, vo = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    if (g.index) { const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[io++] = ia[i] + vo; }
    else for (let i = 0; i < n; i++) idx[io++] = i + vo;
    vo += n;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
};

// Fill a geometry's color attribute with one tint, for vertex-colour merges
// (merged buildings keep their per-building pastel that way).
NH.tintGeo = function (geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
};
