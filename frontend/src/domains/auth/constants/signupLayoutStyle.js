// 일반·소셜 가입 칸 class 모음 (머리글, 스크롤 칸, 가입 버튼, 중복확인, 이메일 인증)
// 가입 폼·SignupScrollArea·이메일 인증 칸 컴포넌트와 utils/emailVerification/notice.js가 사용
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

// 가입 칸 머리글 문구·몸통
export const HEADER_TEXT_CLASS =
  "mt-[56px] mb-[-10px] font-subheading app-text-scaled [--app-text-size:12px] font-bold leading-snug text-text-body/90"

export const SIGNUP_FORM_BODY_CLASS = "flex min-h-0 flex-1 flex-col overflow-hidden"

// 스크롤 칸: 기본 스크롤바 숨기고 공용 Scrollbar 위치만 맞춤
export const SCROLL_WRAP_CLASS =
  "relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden"

export const SCROLL_AREA_CLASS =
  `absolute inset-0 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain pt-3 pb-12 pr-[clamp(0.85rem,1.6vw,1.15rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const SIGNUP_SCROLLBAR_CLASS =
  "z-10 !h-auto !translate-x-0 -translate-y-1 !top-0 !bottom-6"

// 인증 전 안내 문구, 가입 버튼(그림을 줄여 씀), 로그인 전환 줄
export const SIGNUP_HINT_TEXT_CLASS =
  "px-2 text-center font-subheading app-text-scaled [--app-text-size:12px] leading-snug text-black"

export const SUBMIT_BTN_WRAP_CLASS =
  "mx-auto mt-0.5 w-[94%] max-h-[2.65rem] overflow-hidden"

export const SUBMIT_BTN_CLASS =
  "block w-full origin-top scale-[0.62] cursor-pointer"

export const MODE_SWITCH_CLASS = "mt-2 mb-2 origin-top scale-[0.94] [&_p]:mt-0"

// 인증번호 받기 버튼 크기·눌림 효과 (줄인 크기 기준으로 커지고 작아짐)
const ACTION_BTN_SCALE_CLASS = "shrink-0 cursor-pointer scale-[0.64]"

export const ACTION_BTN_INTERACTION_CLASS =
  "transition-transform duration-200 ease-out hover:scale-[0.68] active:scale-[0.61] disabled:hover:scale-[0.64] disabled:active:scale-[0.64]"

// 이메일 중복확인: 버튼과 결과 문구를 grid 한 칸에 겹침
export const EMAIL_CHECK_BLOCK_CLASS =
  "relative z-10 mx-auto mt-0.5 grid min-h-[2.5rem] w-[97%] grid-cols-1 grid-rows-1 py-0 leading-none"

export const EMAIL_CHECK_BTN_CLASS =
  "col-start-1 row-start-1 justify-self-start min-w-[7.5rem] shrink-0 cursor-pointer [&_img]:block [&_img]:h-[2.5rem] [&_img]:w-full"

export const EMAIL_CHECK_BTN_LABEL_CLASS =
  "whitespace-nowrap px-1 app-text-scaled [--app-text-size:12px] leading-none"

export const EMAIL_CHECK_MSG_LAYER_CLASS =
  "pointer-events-none col-start-1 row-start-1 flex min-w-0 items-center justify-end self-stretch pl-[8rem] pr-[2%]"

export const EMAIL_CHECK_MSG_CLASS =
  "shrink-0 whitespace-nowrap app-text-scaled [--app-text-size:13px] leading-none"

export const EMAIL_CHECK_MSG_AVAILABLE_CLASS = "text-emerald-800"

export const EMAIL_CHECK_MSG_ERROR_CLASS = "text-red-800"
// 이메일 인증 칸: 틀·제목·안내 줄 자리·안내 글자 색(에러·안내·완료)
export const EMAIL_VERIFICATION_BLOCK_CLASS =
  "mx-auto flex w-[97%] flex-col gap-0.5 rounded bg-white/10 px-1.5 py-1"

export const EMAIL_VERIFICATION_TITLE_CLASS =
  "px-1 font-subheading app-text-scaled [--app-text-size:13px] font-bold leading-none text-black"

export const EMAIL_VERIFICATION_NOTICE_SLOT_CLASS = "shrink-0 px-1"

export const EMAIL_VERIFICATION_NOTICE_SLOT_RESERVED_CLASS =
  "min-h-[1.35rem]"

export const EMAIL_VERIFICATION_NOTICE_ERROR_CLASS =
  "app-text-scaled [--app-text-size:13px] leading-tight text-red-800"

export const EMAIL_VERIFICATION_NOTICE_INFO_CLASS =
  "app-text-scaled [--app-text-size:11px] leading-tight text-white/70"

export const EMAIL_VERIFICATION_NOTICE_SUCCESS_CLASS =
  "app-text-scaled [--app-text-size:11px] leading-tight text-emerald-400"

// 인증번호 받기 버튼 자리·글자
export const CODE_SEND_BTN_CLASS =
  `${ACTION_BTN_SCALE_CLASS} origin-right w-[clamp(5rem,32%,5.8rem)]`

export const ACTION_BTN_LABEL_CLASS =
  "!text-black app-text-scaled [--app-text-size:15px] leading-tight"
