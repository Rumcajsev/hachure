/** Pure polygon and curve geometry utilities — no canvas, no React, no store deps. */

/** Douglas-Peucker polyline simplification. Removes points that deviate less than
 *  epsilon from the straight line between their neighbors. Retains first and last point. */
export function douglasPeucker(pts: [number, number][], epsilon: number): [number, number][] {
  if (pts.length < 3 || epsilon <= 0) return pts
  const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1]
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy)
  let maxDist = 0, maxIdx = 1
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len < 1e-10
      ? Math.hypot(pts[i][0] - x1, pts[i][1] - y1)
      : Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > epsilon) {
    const L = douglasPeucker(pts.slice(0, maxIdx + 1), epsilon)
    const R = douglasPeucker(pts.slice(maxIdx), epsilon)
    return [...L.slice(0, -1), ...R]
  }
  return [pts[0], pts[pts.length - 1]]
}

export function hexAdjacent(q1: number, r1: number, q2: number, r2: number): boolean {
  const dq = q2 - q1, dr = r2 - r1
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 1
}

/** Centripetal Catmull-Rom curve interpolation via Barry-Goldman — prevents cusps and
 *  loops at sharp angles. */
export function catmullRom(pts: [number, number][], steps: number): [number, number][] {
  if (pts.length < 2) return pts
  const ext: [number, number][] = [
    [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]],
    ...pts,
    [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]],
  ]
  const knot = (a: [number, number], b: [number, number]) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]))
  const lerp2 = (a: [number, number], b: [number, number], ta: number, tb: number, t: number): [number, number] => {
    if (Math.abs(tb - ta) < 1e-12) return a
    const f = (t - ta) / (tb - ta)
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]
  }
  const result: [number, number][] = []
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2]
    const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3)
    for (let s = 0; s < steps; s++) {
      const t = t1 + (t2 - t1) * s / steps
      const A1 = lerp2(p0, p1, t0, t1, t), A2 = lerp2(p1, p2, t1, t2, t), A3 = lerp2(p2, p3, t2, t3, t)
      const B1 = lerp2(A1, A2, t0, t2, t), B2 = lerp2(A2, A3, t1, t3, t)
      result.push(lerp2(B1, B2, t1, t2, t))
    }
  }
  result.push(pts[pts.length - 1])
  return result
}

/** Chaikin corner-cutting. When closed=true the polygon wraps; when false the two
 *  endpoints are pinned so the open polyline doesn't shrink away from its ends. */
export function chaikin(pts: [number, number][], iterations = 1, closed = false): [number, number][] {
  let r = pts
  for (let n = 0; n < iterations; n++) {
    if (closed) {
      const next: [number, number][] = []
      for (let i = 0; i < r.length; i++) {
        const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]
        next.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1])
        next.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1])
      }
      r = next
    } else {
      const next: [number, number][] = [r[0]]
      for (let i = 0; i < r.length - 1; i++) {
        const [x0, y0] = r[i], [x1, y1] = r[i + 1]
        next.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1])
        next.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1])
      }
      next.push(r[r.length - 1])
      r = next
    }
  }
  return r
}

export function distToSeg(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy
  if (len2 < 1e-10) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

export function offsetPolyline(pts: [number, number][], offset: number): [number, number][] {
  if (pts.length < 2 || offset === 0) return pts
  return pts.map((p, i) => {
    let nx = 0, ny = 0, cnt = 0
    if (i > 0) {
      const dx = p[0] - pts[i - 1][0], dy = p[1] - pts[i - 1][1]
      const len = Math.hypot(dx, dy)
      if (len > 1e-6) { nx += -dy / len; ny += dx / len; cnt++ }
    }
    if (i < pts.length - 1) {
      const dx = pts[i + 1][0] - p[0], dy = pts[i + 1][1] - p[1]
      const len = Math.hypot(dx, dy)
      if (len > 1e-6) { nx += -dy / len; ny += dx / len; cnt++ }
    }
    if (cnt === 0) return p
    const nlen = Math.hypot(nx, ny)
    if (nlen < 1e-6) return p
    return [p[0] + (nx / nlen) * offset, p[1] + (ny / nlen) * offset] as [number, number]
  })
}

export function subdivideClosedPolygon(pts: [number, number][], targetLen: number): [number, number][] {
  if (targetLen <= 0 || pts.length < 3) return pts
  const result: [number, number][] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    result.push(a)
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    const segs = Math.max(1, Math.floor(d / targetLen))
    for (let s = 1; s < segs; s++) {
      const t = s / segs
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return result
}

export function offsetClosedPolygon(pts: [number, number][], d: number): [number, number][] {
  if (d === 0 || pts.length < 3) return pts
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
  return pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return [x, y] as [number, number]
    return [x + (dx / len) * d, y + (dy / len) * d] as [number, number]
  })
}

export function resampleSmoothQuad(pts: [number, number][], samplesPerSeg: number): [number, number][] {
  const n = pts.length
  if (n < 3) return pts
  const result: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const p0 = pts[i]
    const prev = pts[(i + n - 1) % n], next = pts[(i + 1) % n]
    const m0x = (prev[0] + p0[0]) / 2, m0y = (prev[1] + p0[1]) / 2
    const m1x = (p0[0] + next[0]) / 2, m1y = (p0[1] + next[1]) / 2
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, mt = 1 - t
      result.push([
        mt * mt * m0x + 2 * mt * t * p0[0] + t * t * m1x,
        mt * mt * m0y + 2 * mt * t * p0[1] + t * t * m1y,
      ])
    }
  }
  return result
}

export function pointInPolygon(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1]
    const xj = pts[j][0], yj = pts[j][1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

/** Clip a subject polygon against a convex clip polygon (Sutherland-Hodgman).
 *  Both arrays are (last point ≠ first point) vertex lists.
 *  Works for any winding order — sign is inferred from the clip polygon's area. */
export function clipPolygonToConvex(
  subject: [number, number][],
  clip: [number, number][],
): [number, number][] {
  // Compute signed area of clip to determine which side is "inside"
  let area2 = 0
  const nc = clip.length
  for (let i = 0; i < nc; i++) {
    const a = clip[i], b = clip[(i + 1) % nc]
    area2 += a[0] * b[1] - b[0] * a[1]
  }
  const sign = area2 >= 0 ? 1 : -1

  let output = subject.slice()
  for (let i = 0; i < nc && output.length > 0; i++) {
    const ea = clip[i], eb = clip[(i + 1) % nc]
    const edx = eb[0] - ea[0], edy = eb[1] - ea[1]
    const inside = (p: [number, number]) =>
      (edx * (p[1] - ea[1]) - edy * (p[0] - ea[0])) * sign >= 0
    const intersect = (a: [number, number], b: [number, number]): [number, number] => {
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const t = (edx * (a[1] - ea[1]) - edy * (a[0] - ea[0])) / (edy * dx - edx * dy)
      return [a[0] + t * dx, a[1] + t * dy]
    }
    const input = output
    output = []
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j - 1 + input.length) % input.length]
      const curIn = inside(cur), prevIn = inside(prev)
      if (curIn) {
        if (!prevIn) output.push(intersect(prev, cur))
        output.push(cur)
      } else if (prevIn) {
        output.push(intersect(prev, cur))
      }
    }
  }
  return output
}
