import { useState } from "react"
import PublicAsset from "@/shared/ui/PublicAsset"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

export default function Stepper({
  options,
  defaultIndex = 0,
  index: controlledIndex,
  onIndexChange,
  ariaLabel,
  inputFieldSrc,
  arrowSrc,
  valueClassName = "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.98rem,1.35vw,1.08rem)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]",
  valueWidthClassName = "relative w-[clamp(7.25rem,13vw,9.25rem)]",
  buttonClassName = "block w-[clamp(1.9rem,2.55vw,2.15rem)] cursor-pointer border-0 bg-transparent p-0 opacity-90 hover:opacity-100 disabled:cursor-default disabled:opacity-40",
  arrowWrapClassName = "block",
  arrowImageClassName = "block h-auto w-full select-none",
}) {
  const [internalIndex, setInternalIndex] = useState(defaultIndex)
  const isControlled = controlledIndex !== undefined
  const index = isControlled ? controlledIndex : internalIndex
  const value = options[index]
  const atMin = index === 0
  const atMax = index === options.length - 1

  const updateIndex = (next, event) => {
    const resolved = typeof next === "function" ? next(index) : next
    const clamped = Math.max(0, Math.min(options.length - 1, resolved))
    if (clamped !== index) dispatchUiSfx("ui-click", event)
    if (!isControlled) setInternalIndex(clamped)
    onIndexChange?.(clamped)
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`${ariaLabel} 감소`}
        disabled={atMin}
        data-sfx-owner="explicit"
        onClick={(event) => updateIndex((prev) => prev - 1, event)}
        className={buttonClassName}
      >
        <span className={arrowWrapClassName}>
          <PublicAsset
            src={arrowSrc}
            alt=""
            className={arrowImageClassName}
          />
        </span>
      </button>
      <div className={valueWidthClassName}>
        <PublicAsset
          src={inputFieldSrc}
          alt=""
          className="block h-auto w-full select-none"
        />
        <span className={valueClassName}>{value}</span>
      </div>
      <button
        type="button"
        aria-label={`${ariaLabel} 증가`}
        disabled={atMax}
        data-sfx-owner="explicit"
        onClick={(event) => updateIndex((prev) => prev + 1, event)}
        className={buttonClassName}
      >
        <span className={arrowWrapClassName}>
          <PublicAsset
            src={arrowSrc}
            alt=""
            className={`${arrowImageClassName} rotate-180`}
          />
        </span>
      </button>
    </div>
  )
}
