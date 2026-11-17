import type { Telemetry } from '../api'

export const MPS_TO_MPH = 2.236936

export const GEARS = ['P', 'D', 'R', 'N'] as const
export const AUTOPILOT = [null, 'FSD', 'Autosteer', 'TACC'] as const

/** The index of the last sample at or before `seconds`, or -1 before the first one. */
export function sampleIndex(t: number[], seconds: number): number {
  let lo = 0
  let hi = t.length - 1
  if (hi < 0 || seconds < t[0]) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (t[mid] <= seconds) lo = mid
    else hi = mid - 1
  }
  return lo
}

export interface Sample {
  speedMph: number
  gear: (typeof GEARS)[number]
  steeringDeg: number
  /** 0–1. */
  accelerator: number
  brake: boolean
  autopilot: (typeof AUTOPILOT)[number]
  blinkerLeft: boolean
  blinkerRight: boolean
  /** Horizontal acceleration in g. */
  g: number
  lonLat: [number, number] | null
}

/** The car's state at `seconds`, or null when there is no telemetry within a second of it. */
export function sampleAt(tel: Telemetry, seconds: number): Sample | null {
  const i = sampleIndex(tel.t, seconds)
  if (i < 0 || seconds - tel.t[i] > 1) return null
  const lat = tel.lat[i]
  const lon = tel.lon[i]
  // Older firmware reports the pedal as 0–100, newer as 0–1.
  const pedal = tel.accelerator[i]
  return {
    speedMph: Math.abs(tel.speedMps[i]) * MPS_TO_MPH,
    gear: GEARS[tel.gear[i]] ?? 'P',
    steeringDeg: tel.steeringDeg[i],
    accelerator: Math.min(1, Math.max(0, pedal > 1 ? pedal / 100 : pedal)),
    brake: tel.brake[i],
    autopilot: AUTOPILOT[tel.autopilot[i]] ?? null,
    blinkerLeft: tel.blinkerLeft[i],
    blinkerRight: tel.blinkerRight[i],
    g: Math.hypot(tel.accelX[i], tel.accelY[i]) / 9.80665,
    lonLat: lat != null && lon != null ? [lon, lat] : null,
  }
}

/** The route as [lon, lat] points, about one a second, skipping samples without a GPS fix. */
export function routeOf(tel: Telemetry): [number, number][] {
  const every = Math.max(1, Math.round(tel.hz))
  const out: [number, number][] = []
  for (let i = 0; i < tel.t.length; i += every) {
    const lat = tel.lat[i]
    const lon = tel.lon[i]
    if (lat != null && lon != null) out.push([lon, lat])
  }
  return out
}

/** Length of a [lon, lat] route in metres (great-circle). */
export function routeMetres(route: [number, number][]): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  let total = 0
  for (let i = 1; i < route.length; i++) {
    const [lon1, lat1] = route[i - 1]
    const [lon2, lat2] = route[i]
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
    total += 2 * 6_371_000 * Math.asin(Math.sqrt(a))
  }
  return total
}

/**
 * Forward acceleration in g, positive when speeding up, averaged over `every` samples to calm sensor noise.
 * dashcam.proto doesn't name the axes; on real drives the change in speed follows -y (r ≈ 0.8) and not x,
 * so y is the car's long axis pointing backwards and x is sideways.
 */
export function forwardG(tel: Telemetry, i: number, every = 1): number {
  const end = Math.min(tel.accelY.length, i + every)
  let sum = 0
  for (let k = i; k < end; k++) sum += tel.accelY[k]
  return -sum / Math.max(1, end - i) / 9.80665
}

/** Stretches where Autopilot (any mode) was engaged, as [start, end] seconds; gaps under two seconds are bridged. */
export function assistedRuns(tel: Telemetry): [number, number][] {
  const runs: [number, number][] = []
  for (let i = 0; i < tel.t.length; i++) {
    if (!tel.autopilot[i]) continue
    const last = runs[runs.length - 1]
    if (last && tel.t[i] - last[1] < 2) last[1] = tel.t[i]
    else runs.push([tel.t[i], tel.t[i]])
  }
  return runs.filter(([a, b]) => b - a >= 1)
}
