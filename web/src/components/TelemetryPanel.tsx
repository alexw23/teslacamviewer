import { useMemo, useState } from 'react'
import type { Telemetry } from '../api'
import { formatClock, formatSpeed, formatTripDistance, speedUnit, speedValue } from '../lib/format'
import { MPS_TO_MPH, routeMetres, routeOf, sampleAt } from '../lib/telemetry'
import { RouteMap } from './RouteMap'
import { TimeChart } from './TimeChart'
import { Card } from './ui'

/**
 * Where the car went during an event and how fast, following the player: the map's dot is the car now.
 * Hovering the chart moves the dot to that moment instead, and clicking it seeks there.
 */
export function TelemetryPanel({ telemetry, position, total, onSeek }: { telemetry: Telemetry; position: number; total: number; onSeek: (seconds: number) => void }) {
  const [hover, setHover] = useState<number | null>(null)

  const data = useMemo(() => {
    const route = routeOf(telemetry)
    const every = Math.max(1, Math.round(telemetry.hz / 2))
    const speed = []
    for (let i = 0; i < telemetry.t.length; i += every) speed.push({ t: telemetry.t[i], v: speedValue(Math.abs(telemetry.speedMps[i]) * MPS_TO_MPH) })
    const metres = routeMetres(route)
    const topMph = Math.max(0, ...telemetry.speedMps.map((v) => Math.abs(v) * MPS_TO_MPH))
    const assisted = telemetry.autopilot.filter((a) => a > 0).length / Math.max(1, telemetry.autopilot.length)
    return { route, speed, miles: metres / 1609.344, topMph, assisted }
  }, [telemetry])

  const at = sampleAt(telemetry, hover ?? position)
  const ticks = useMemo(() => {
    const top = Math.max(...data.speed.map((p) => p.v), 1)
    const step = top > 100 ? 40 : 20
    return Array.from({ length: Math.ceil(top / step) + 1 }, (_, i) => i * step)
  }, [data.speed])

  return (
    <Card className="overflow-hidden">
      {data.route.length > 1 && <RouteMap route={data.route} marker={at?.lonLat ?? null} className="h-56 w-full" />}
      <div className="space-y-3 px-4 py-3">
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <Fact label="Distance" value={formatTripDistance(data.miles)} />
          <Fact label="Top speed" value={formatSpeed(data.topMph)} />
          <Fact label="Autopilot" value={`${Math.round(data.assisted * 100)}%`} />
        </dl>
        {data.speed.length > 1 && (
          // A div wrapper takes the click: TimeChart only reports hovers.
          <div onClick={() => hover != null && onSeek(hover)} className="cursor-pointer">
            <TimeChart
              title={`Speed (${speedUnit})`}
              points={data.speed}
              start={0}
              end={total}
              hover={hover ?? position}
              onHover={setHover}
              format={(v) => `${Math.round(v)} ${speedUnit} · ${formatClock(hover ?? position)}`}
              ticks={ticks}
              className="h-28"
            />
          </div>
        )}
      </div>
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-faint uppercase">{label}</dt>
      <dd className="tabular mt-0.5 font-semibold">{value}</dd>
    </div>
  )
}
