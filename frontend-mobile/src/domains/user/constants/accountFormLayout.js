import { buildLoginParchmentFrameStyle } from "@m/domains/auth/constants/loginParchmentFrameStyle.js"

// 계정 관리: 제목·안내(94%) / 입력·버튼(더 좁게·작게). 양피지 가로는 로그인과 동일
export const ACCOUNT_FORM_TEXT_WIDTH = "w-[94%]"

export const ACCOUNT_FORM_CONTROL_WIDTH = "w-[94%]"

export const ACCOUNT_FORM_TEXT_CLASS = `mx-auto ${ACCOUNT_FORM_TEXT_WIDTH} text-left`

// 제목(94%·3% 시작)과 왼쪽 맞춤
export const ACCOUNT_FORM_CONTROL_ALIGN_CLASS = `ml-[3%] mr-auto ${ACCOUNT_FORM_CONTROL_WIDTH}`

export const ACCOUNT_FORM_ACTIONS_ROW_CLASS = `${ACCOUNT_FORM_CONTROL_ALIGN_CLASS} flex justify-end`

export const ACCOUNT_FORM_ALIGN_CLASS = `mx-auto ${ACCOUNT_FORM_TEXT_WIDTH}`

// 세로 간격 (양피지 안에 들어가도록)
export const ACCOUNT_PANEL_STACK_CLASS =
  "flex w-full flex-col gap-1 pt-[calc(100cqw*0.02)]"

export const ACCOUNT_SECTION_CLASS =
  "flex flex-col gap-1 border-b border-[#8b6a3e]/30 pb-1.5 last:border-b-0 last:pb-0"

export const ACCOUNT_SECTION_FORM_CLASS = "flex w-full flex-col gap-1"

export const ACCOUNT_FORM_ACTIONS_STACK_CLASS = "flex w-full flex-col gap-0.5"

// 양피지 틀 래퍼 (가로는 로그인과 동일)
export const ACCOUNT_FRAME_WRAP_CLASS =
  "@container mx-auto flex w-[94%] max-w-[20.5rem] flex-1 items-center justify-center px-0 pb-5 pt-1 land:max-w-[19rem] md:max-w-[28rem]"

export const ACCOUNT_PARCHMENT_FRAME_BOX_CLASS = "w-full"

// 내용이 길어도 항상 아래 양피지가 더 늘어남 (cqw = ACCOUNT_FRAME_WRAP @container 폭)
export const ACCOUNT_PARCHMENT_EXTRA_BOTTOM_CLASS = "shrink-0 min-h-[calc(100cqw*0.04)]"

// 로그인 대비 안쪽 위·아래만 살짝 → 세로만 약간 길게
export function getAccountParchmentFrameStyle() {
  return buildLoginParchmentFrameStyle({
    paddingTop: 134,
    paddingBottom: 46,
  })
}
