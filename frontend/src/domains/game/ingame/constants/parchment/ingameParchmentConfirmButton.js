/** 파치먼트 모달 공용 확인 버튼 public 에셋 (frontend/public 기준) */
export const INGAME_PARCHMENT_CONFIRM_BUTTON_ASSET =
  "/button/버튼(수락 및 긍정).png".normalize("NFD")

/** 파치먼트 모달 확인 버튼 기본 문구 */
export const INGAME_PARCHMENT_CONFIRM_LABEL = "확인"

export const INGAME_PARCHMENT_CONFIRM_BUTTON_IMG_CLASS =
  "block h-auto w-full select-none"

export const INGAME_PARCHMENT_CONFIRM_BUTTON_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center pb-[2%] pt-[clamp(0.07rem,0.23vw,0.12rem)] font-subheading text-[clamp(0.78rem,1.85vw,0.92rem)] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

const INGAME_PARCHMENT_CONFIRM_BUTTON_BASE_CLASS =
  "interactive-scale relative block w-[clamp(6rem,14.7vw,9.3rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

/** 역할 공개·밤 턴 안내 — 버튼을 내용 쪽으로 살짝 당긴다 */
export const INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_TIGHT =
  `${INGAME_PARCHMENT_CONFIRM_BUTTON_BASE_CLASS} -mt-[clamp(0.15rem,0.45vw,0.3rem)]`

/** DAY/NIGHT 진입·밤 조사 결과 — 키보드 포커스 링을 유지한다 */
export const INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_RAISED_FOCUS =
  `${INGAME_PARCHMENT_CONFIRM_BUTTON_BASE_CLASS} mt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b4321]`
