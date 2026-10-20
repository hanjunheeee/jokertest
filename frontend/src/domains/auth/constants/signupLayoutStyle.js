import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

/** 회원가입 화면 안내 문구 */
export const SIGNUP_HEADER_TEXT_CLASS =
  "mt-[56px] mb-[-10px] font-subheading app-text-scaled [--app-text-size:12px] font-bold leading-snug text-text-body/90"

/** 회원가입 폼 본문 — 헤더 아래 스크롤 영역이 남은 높이를 채움 */
export const SIGNUP_FORM_BODY_CLASS = "flex min-h-0 flex-1 flex-col overflow-hidden"

/** 회원가입 폼 스크롤 래퍼 — shared Scrollbar 오버레이 기준 */
/** mt-2 — 헤더 mt 증가분만큼 줄여 스크롤바(래퍼) 위치는 유지 */
export const SIGNUP_SCROLL_WRAP_CLASS =
  "relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden"

/** 회원가입 폼 스크롤 목록 — absolute inset-0으로 래퍼 높이에 고정, 네이티브 숨김 + shared Scrollbar */
export const SIGNUP_SCROLL_AREA_CLASS =
  `absolute inset-0 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain pt-3 pb-12 pr-[clamp(0.85rem,1.6vw,1.15rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

/** shared Scrollbar — 하단 여백 + 약간 위로(inset-y-0·h-full 덮어씀) */
export const SIGNUP_SCROLLBAR_CLASS =
  "z-10 !h-auto !translate-x-0 -translate-y-1 !top-0 !bottom-6"

/** 회원가입 보조 안내 문구 */
export const SIGNUP_HINT_TEXT_CLASS =
  "px-2 text-center font-subheading app-text-scaled [--app-text-size:12px] leading-snug text-black"

/** 회원가입 제출 버튼 래퍼 — scale 후 시각 높이만큼 클립 */
export const SIGNUP_SUBMIT_BUTTON_WRAP_CLASS =
  "mx-auto mt-0.5 w-[94%] max-h-[2.65rem] overflow-hidden"

/** 회원가입 제출 버튼 */
export const SIGNUP_SUBMIT_BUTTON_CLASS =
  "block w-full origin-top scale-[0.62] cursor-pointer"

/** 회원가입 하단 모드 전환 안내 */
export const SIGNUP_MODE_SWITCH_CLASS = "mt-2 mb-2 origin-top scale-[0.94] [&_p]:mt-0"

/** 회원가입 보조 액션(인증번호 받기 등) — transform scale만 적용(레이아웃 박스는 그대로) */
const SIGNUP_ACTION_BUTTON_SCALE_CLASS = "shrink-0 cursor-pointer scale-[0.64]"

/** scale-[0.64] 위에서 쓰는 약한 hover — AuthImageButton 기본(1.05)은 축소 버튼에서 과장된다 */
export const SIGNUP_ACTION_BUTTON_INTERACTION_CLASS =
  "transition-transform duration-200 ease-out hover:scale-[0.68] active:scale-[0.61] disabled:hover:scale-[0.64] disabled:active:scale-[0.64]"

/** compact 입력칸과 동일한 w-full — alert pr 9%가 AuthInputSlot px-[9%]와 같은 기준 */
export const SIGNUP_EMAIL_CHECK_BLOCK_CLASS =
  "relative z-10 mx-auto mt-0.5 grid min-h-[2.5rem] w-[97%] grid-cols-1 grid-rows-1 py-0 leading-none"

/** 이메일 중복확인 — img 높이로 리소스 크기 고정 */
export const SIGNUP_EMAIL_CHECK_BUTTON_CLASS =
  "col-start-1 row-start-1 justify-self-start min-w-[7.5rem] shrink-0 cursor-pointer [&_img]:block [&_img]:h-[2.5rem] [&_img]:w-full"

/** 이메일 중복확인 버튼 겹침 텍스트 — 줄바꿈 없음 */
export const SIGNUP_EMAIL_CHECK_BUTTON_LABEL_CLASS =
  "whitespace-nowrap px-1 app-text-scaled [--app-text-size:12px] leading-none"

/** 중복확인 alert 레이어 — 버튼과 같은 그리드 셀, 우측 정렬 */
export const SIGNUP_EMAIL_CHECK_MESSAGE_LAYER_CLASS =
  "pointer-events-none col-start-1 row-start-1 flex min-w-0 items-center justify-end self-stretch pl-[8rem] pr-[2%]"

/** 중복확인 alert 텍스트 */
export const SIGNUP_EMAIL_CHECK_MESSAGE_CLASS =
  "shrink-0 whitespace-nowrap app-text-scaled [--app-text-size:13px] leading-none"

/** 사용 가능 이메일 안내 — 약간 어두운 녹색 */
export const SIGNUP_EMAIL_CHECK_MESSAGE_AVAILABLE_CLASS = "text-emerald-800"

/** 중복·오류 이메일 안내 — 약간 어두운 적색 */
export const SIGNUP_EMAIL_CHECK_MESSAGE_ERROR_CLASS = "text-red-800"
/** 이메일 인증 블록 — compact 입력칸(scale 0.97)과 좌우 끝 맞춤 */
export const SIGNUP_EMAIL_VERIFICATION_BLOCK_CLASS =
  "mx-auto flex w-[97%] flex-col gap-0.5 rounded bg-white/10 px-1.5 py-1"

export const SIGNUP_EMAIL_VERIFICATION_TITLE_CLASS =
  "px-1 font-subheading app-text-scaled [--app-text-size:13px] font-bold leading-none text-black"

/** 인증 alert·카운트다운 */
export const SIGNUP_EMAIL_VERIFICATION_NOTICE_SLOT_CLASS = "shrink-0 px-1"

/** 코드 입력 표시 시 alert 1줄 높이 예약 — alert 등장 시 추가 높이 증가 방지 */
export const SIGNUP_EMAIL_VERIFICATION_NOTICE_SLOT_RESERVED_CLASS =
  "min-h-[1.35rem]"

export const SIGNUP_EMAIL_VERIFICATION_NOTICE_ERROR_CLASS =
  "app-text-scaled [--app-text-size:13px] leading-tight text-red-800"

export const SIGNUP_EMAIL_VERIFICATION_NOTICE_INFO_CLASS =
  "app-text-scaled [--app-text-size:11px] leading-tight text-white/70"

export const SIGNUP_EMAIL_VERIFICATION_NOTICE_SUCCESS_CLASS =
  "app-text-scaled [--app-text-size:11px] leading-tight text-emerald-400"

export const SIGNUP_CODE_SEND_BUTTON_CLASS =
  `${SIGNUP_ACTION_BUTTON_SCALE_CLASS} origin-right w-[clamp(5rem,32%,5.8rem)]`

/** 인증번호 받기 버튼 겹침 텍스트 — AuthImageButton 기본 text-white 덮어씀 */
export const SIGNUP_ACTION_BUTTON_LABEL_CLASS =
  "!text-black app-text-scaled [--app-text-size:15px] leading-tight"
