export const PAGE_SOUND_CONTROL_AREA_CLASS =
  "absolute bottom-4 right-4 z-30 flex flex-col items-end gap-[clamp(0.75rem,1.6vh,1.25rem)] sm:bottom-6 sm:right-6"

export const PAGE_SOUND_CONTROL_ELEVATED_AREA_CLASS =
  "pointer-events-auto absolute bottom-4 right-4 z-40 flex flex-col items-end gap-[clamp(0.75rem,1.6vh,1.25rem)] sm:bottom-6 sm:right-6"

export const SOUND_CONTROL_CLASSES = {
  iconSize: "w-[clamp(2.85rem,3.9vw,3.5rem)]",
  barWidth: "w-[clamp(10.75rem,14.8vw,13.5rem)]",
  iconOverlap: "-mr-[16%]",
  barOffset: "translate-x-[clamp(0.35rem,1.1vw,0.55rem)]",
  sliderBar: "block h-auto w-full select-none",
  sliderKnotWrap:
    "pointer-events-none absolute top-1/2 z-10 w-[24%] max-w-[1.15rem] min-w-[0.9rem] -translate-x-1/2 -translate-y-1/2",
  sliderKnotImage: "block h-auto w-full select-none",
}

const KNOT_INSET_PERCENT = { start: 20, end: 8 }

export function getSliderKnotLeftPercent(value) {
  const travel = 100 - KNOT_INSET_PERCENT.start - KNOT_INSET_PERCENT.end
  return KNOT_INSET_PERCENT.start + value * travel
}
