import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cx, speedUnit, speedValue } from '../lib/format'
import { GEARS, type Sample } from '../lib/telemetry'

/** The car's controls at the current moment, laid over the main camera: gear, wheel, speed, pedals and indicators. */
export function DriveCard({ sample, className }: { sample: Sample; className?: string }) {
  return (
    <div className={cx('pointer-events-none flex items-center gap-3 rounded-xl bg-black/70 px-3 py-2 shadow-lg backdrop-blur-sm', className)}>
      <Blinker on={sample.blinkerLeft}>
        <ChevronLeft className="size-4" />
      </Blinker>

      <div className="flex flex-col text-[10px] leading-[1.15] font-semibold">
        {(['P', 'R', 'N', 'D'] as (typeof GEARS)[number][]).map((g) => (
          <span key={g} className={g === sample.gear ? 'text-fg' : 'text-faint/60'}>
            {g}
          </span>
        ))}
      </div>

      <Wheel deg={sample.steeringDeg} active={!!sample.autopilot} />

      <div className="min-w-14 text-center">
        <div className="tabular text-3xl leading-none font-semibold">{Math.round(speedValue(sample.speedMph))}</div>
        <div className="mt-1 text-[10px] font-medium tracking-wide text-dim uppercase">{speedUnit}</div>
        {sample.autopilot && <div className="mt-1 text-[10px] font-semibold text-blue">{sample.autopilot}</div>}
      </div>

      <div className="flex h-10 items-end gap-1" title="Brake and accelerator">
        <Pedal value={sample.brake ? 1 : 0} tone="bg-accent" />
        <Pedal value={sample.accelerator} tone="bg-ok" />
      </div>

      <div className="tabular w-9 text-right text-[10px] text-dim">{sample.g.toFixed(2)}g</div>

      <Blinker on={sample.blinkerRight}>
        <ChevronRight className="size-4" />
      </Blinker>
    </div>
  )
}

function Blinker({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <span className={cx('transition-colors', on ? 'animate-pulse text-ok' : 'text-faint/40')}>{children}</span>
}

function Pedal({ value, tone }: { value: number; tone: string }) {
  return (
    <span className="relative h-full w-1.5 overflow-hidden rounded-full bg-white/10">
      <span className={cx('absolute inset-x-0 bottom-0 rounded-full', tone)} style={{ height: `${Math.round(value * 100)}%` }} />
    </span>
  )
}

/** A steering wheel turned by the wheel angle; blue while Autopilot steers. */
function Wheel({ deg, active }: { deg: number; active: boolean }) {
  return (
    <svg viewBox="-20 -20 40 40" className={cx('size-10 shrink-0 transition-transform duration-100', active ? 'text-blue' : 'text-dim')} style={{ transform: `rotate(${deg}deg)` }} aria-label={`Steering ${Math.round(deg)}°`}>
      <circle r="16" fill="none" stroke="currentColor" strokeWidth="3.5" />
      <circle r="4.5" fill="currentColor" />
      <path d="M-16 0H-4.5M4.5 0H16M0 4.5V16" stroke="currentColor" strokeWidth="3.5" />
      <circle cy="-16" r="1.8" className="fill-accent" />
    </svg>
  )
}
