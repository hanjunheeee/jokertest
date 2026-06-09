import { useState } from "react"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function Stepper({
  options,
  defaultIndex = 0,
  ariaLabel,
  inputFieldSrc,
  arrowSrc,
  valueClassName = "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.98rem,1.35vw,1.08rem)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]",
  valueWidthClassName = "relative w-[clamp(7.25rem,13vw,9.25rem)]",
  buttonClassName = "block w-[clamp(1.9rem,2.55vw,2.15rem)] cursor-pointer border-0 bg-transparent p-0 opacity-90 hover:opacity-100 disabled:cursor-default disabled:opacity-40",
}) {
  const [index, setIndex] = useState(defaultIndex)
  const value = options[index]
  const atMin = index === 0
  const atMax = index === options.length - 1

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`${ariaLabel} 감소`}
        disabled={atMin}
        onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
        className={buttonClassName}
      >
        <PublicAsset
          src={arrowSrc}
          alt=""
          className="block h-auto w-full select-none"
        />
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
        onClick={() =>
          setIndex((prev) => Math.min(options.length - 1, prev + 1))
        }
        className={buttonClassName}
      >
        <PublicAsset
          src={arrowSrc}
          alt=""
          className="block h-auto w-full rotate-180 select-none"
        />
      </button>
    </div>
  )
}
