// 피의 기록 프레임 위의 글자가 배경 이미지에 묻히지 않도록 주는 그림자입니다.
export const BLOOD_RECORD_TEXT_SHADOW = "0 1px 2px rgba(255,255,255,0.35), 0 1px 3px rgba(0,0,0,0.5)"

// 프레임 이미지 안에서 기록 텍스트가 들어갈 영역입니다.
export const BLOOD_RECORD_CONTENT_INSET = {
  top: "24%",
  bottom: "14%",
  left: "15%",
  right: "15%",
}

// 기록 이름과 기록 숫자에 각각 들어가는 글자 스타일입니다.
// cqi는 바깥 프레임 너비를 기준으로 글자 크기를 맞추는 단위입니다.
export const BLOOD_RECORD_ROW_LABEL_CLASS = "font-subheading text-[3.6cqi] font-bold leading-none text-[#3d1810]"
export const BLOOD_RECORD_ROW_VALUE_CLASS = "font-subheading text-[3.8cqi] font-bold leading-none tracking-wide text-[#2a0e08] tabular-nums"

// 피의 기록 프레임 이미지에 기본으로 들어가는 스타일입니다.
export const BLOOD_RECORD_FRAME_IMG_CLASS = "block h-auto w-full shrink-0 select-none"
