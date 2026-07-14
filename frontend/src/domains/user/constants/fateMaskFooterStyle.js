// 운명의 가면 하단 프레임이 천천히 나타나는 애니메이션 설정입니다.
export const FATE_MASK_UI_FADE = {
  duration: 0.7,
  ease: [0.22, 1, 0.36, 1],
}

// 프레임 위의 설명 문장이 배경에 묻히지 않도록 주는 그림자입니다.
export const FATE_MASK_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.55)"

// 프레임 이미지 안에서 설명 문장이 들어갈 위치입니다.
export const FATE_MASK_DESCRIPTION_INSET = {
  top: "55.5%",
  bottom: "20%",
  left: "14%",
  right: "14%",
}

// 운명의 가면 프레임의 너비와 기준 박스입니다.
// cqi 글자 크기를 쓰기 위해 container-type을 켭니다.
export const FATE_MASK_FRAME_WRAP_CLASS = "relative mx-auto w-[min(100%,clamp(26rem,68cqw,34rem))] [container-type:inline-size]"

// 설명 문장 전체와 강조 단어에 들어가는 스타일입니다.
export const FATE_MASK_DESCRIPTION_CLASS = "pointer-events-none absolute flex items-end justify-center pb-[0.18em] text-center font-subheading text-[3.1cqi] font-bold leading-[1.55] text-[#e8e4dc]"
export const FATE_MASK_HIGHLIGHT_CLASS = "text-[#e8c878] [text-shadow:0_0_10px_rgba(232,200,120,0.45)]"

// 운명의 가면 프레임 이미지에 기본으로 들어가는 스타일입니다.
export const FATE_MASK_FRAME_IMG_CLASS = "block h-auto w-full select-none"
