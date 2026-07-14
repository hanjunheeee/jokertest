// SoundControl의 크기와 위치를 정하는 Tailwind class 모음입니다.
// 컴포넌트 파일에서는 렌더링 흐름만 보이도록 스타일 문자열을 이 파일로 분리했습니다.
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

// 슬라이더 knob 이미지가 바 끝에 딱 붙지 않도록 양쪽 여백을 둡니다.
const KNOT_INSET_PERCENT = { start: 20, end: 8 }

// 볼륨 값(0~1)을 slider bar 위의 left 퍼센트 위치로 변환합니다.
export function getSliderKnotLeftPercent(value) {
  const travel = 100 - KNOT_INSET_PERCENT.start - KNOT_INSET_PERCENT.end
  return KNOT_INSET_PERCENT.start + value * travel
}
