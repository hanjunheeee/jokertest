// 양피지 창 확인 버튼: 그림·글·버튼 모양 두 가지
// 양피지 창 부품·창 종류 상수·게임 시작 불가 창·팔레트 저장 창이 사용

// 버튼 그림과 글
export const BTN_ASSET =
  "/button/버튼(수락 및 긍정).png".normalize("NFD")

export const PARCHMENT_CONFIRM_LABEL = "확인"

// 그림·글자 모양
export const IMG_CLASS =
  "block h-auto w-full select-none"

export const LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center pb-[2%] pt-[clamp(0.07rem,0.23vw,0.12rem)] font-subheading text-[clamp(0.78rem,1.85vw,0.92rem)] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 버튼 틀 (바짝 붙임 / 띄우고 포커스 테두리)
const BASE_CLASS =
  "interactive-scale relative block w-[clamp(6rem,14.7vw,9.3rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

export const CONFIRM_BTN_CLASS_TIGHT =
  `${BASE_CLASS} -mt-[clamp(0.15rem,0.45vw,0.3rem)]`

export const CONFIRM_BTN_CLASS_RAISED_FOCUS =
  `${BASE_CLASS} mt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b4321]`
