import { cx, speedUnit, speedValue } from '../lib/format'
import type { Sample } from '../lib/telemetry'

const AUTOPILOT_LABEL = { FSD: 'Self Driving', Autosteer: 'Autosteer', TACC: 'Traffic-Aware Cruise' } as const

/**
 * The car's controls at the current moment, laid over the main camera much like the car's own viewer:
 * gear and brake on the left, indicators either side of the speed, wheel and accelerator on the right.
 */
export function DriveCard({ sample, className }: { sample: Sample; className?: string }) {
  return (
    <div className={cx('pointer-events-none rounded-xl bg-black/70 px-3 pt-2 pb-1.5 shadow-lg backdrop-blur-sm', className)}>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-1.5">
          <span
            className={cx(
              'flex size-5 items-center justify-center rounded-full text-[11px] font-bold',
              sample.gear === 'P' ? 'bg-white/15 text-dim' : 'bg-blue text-white',
            )}
            title="Gear"
          >
            {sample.gear}
          </span>
          <BrakePedal on={sample.brake} />
        </div>

        <Arrow side="left" on={sample.blinkerLeft} />
        <div className="min-w-12 text-center">
          <div className="tabular text-3xl leading-none font-semibold">{Math.round(speedValue(sample.speedMph))}</div>
          <div className="mt-0.5 text-[10px] font-medium tracking-wide text-dim uppercase">{speedUnit}</div>
        </div>
        <Arrow side="right" on={sample.blinkerRight} />

        <div className="flex flex-col items-center gap-1.5">
          <Wheel deg={sample.steeringDeg} active={!!sample.autopilot} />
          <AcceleratorPedal value={sample.accelerator} />
        </div>
      </div>
      <div className={cx('mt-1 h-3.5 text-center text-[11px] leading-none font-medium', sample.autopilot ? 'text-blue' : 'text-transparent')}>
        {sample.autopilot ? AUTOPILOT_LABEL[sample.autopilot] : '·'}
      </div>
    </div>
  )
}

/** A solid indicator arrow: bright green when on, a faint outline when off. */
function Arrow({ side, on }: { side: 'left' | 'right'; on: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={cx('size-4 shrink-0', on ? 'blink text-ok drop-shadow-[0_0_4px_rgb(48_209_88/0.8)]' : 'text-white/15')} aria-label={on ? `${side} indicator on` : undefined}>
      <path d={side === 'left' ? 'M1 6 7 1v3h4v4H7v3z' : 'M11 6 5 1v3H1v4h4v3z'} fill="currentColor" />
    </svg>
  )
}

/** The brake pedal, red while the brake is applied. */
function BrakePedal({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={cx('size-4', on ? 'text-accent-hover drop-shadow-[0_0_4px_rgb(232_33_39/0.8)]' : 'text-white/25')} aria-label={on ? 'Braking' : 'Brake'}>
      <rect x="2" y="5" width="12" height="9" rx="2" fill="currentColor" />
      <path d="M5 5V2h6v3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

/** The accelerator pedal, filling up as it is pressed. */
function AcceleratorPedal({ value }: { value: number }) {
  return (
    <span className="relative h-4 w-2.5 overflow-hidden rounded-[3px] bg-white/15" title={`Accelerator ${Math.round(value * 100)}%`}>
      <span className="absolute inset-x-0 bottom-0 bg-ok" style={{ height: `${Math.round(value * 100)}%` }} />
    </span>
  )
}

/** A steering wheel turned by the wheel angle; blue while Autopilot steers. */
function Wheel({ deg, active }: { deg: number; active: boolean }) {
  return (
    <svg viewBox="-20 -20 40 40" className={cx('size-5 shrink-0', active ? 'text-blue' : 'text-dim')} style={{ transform: `rotate(${deg}deg)` }} aria-label={`Steering ${Math.round(deg)}°`}>
      <circle r="16" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle r="5" fill="currentColor" />
      <path d="M-16 0H-5M5 0H16M0 5V16" stroke="currentColor" strokeWidth="4" />
    </svg>
  )
}
