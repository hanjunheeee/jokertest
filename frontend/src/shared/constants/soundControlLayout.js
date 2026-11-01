// 소리 조절 자리·모양 class와 손잡이 위치 계산
// SoundControl·PageSoundControlArea와 library 화면·user 화면 틀이 씀
export const PAGE_SOUND_CONTROL_AREA_CLASS =
  "absolute bottom-4 right-4 z-30 flex flex-col items-end gap-[clamp(0.75rem,1.6vh,1.25rem)] sm:bottom-6 sm:right-6"

// 다른 층 위로 올려야 하는 화면용 (z-40, 포인터 받음)
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

// 막대 그림 앞뒤 장식 부분 (%)
const KNOT_INSET_PERCENT = { start: 20, end: 8 }

// 0~1 값 → 장식을 뺀 구간 안 손잡이 위치(%)
export function getSliderKnotLeftPercent(value) {
  const travel = 100 - KNOT_INSET_PERCENT.start - KNOT_INSET_PERCENT.end
  return KNOT_INSET_PERCENT.start + value * travel
}
