// 낮밤 시작 안내 창 문구·모양 (단계별 문구 고르기 포함)
// 낮밤 시작 안내 창·안내 훅이 씀
import { DAY_VOTE_OUTCOME_TEXTS } from "./vote/ingameVoteOutcomes.js"

// 안내하는 단계와 단계별 글
export const ENTRANCE_PHASES = Object.freeze(["DAY", "NIGHT"])

const ENTRANCE_MSGS = Object.freeze({
  DAY: "낮이 되었습니다",
  NIGHT: "밤이 되었습니다",
})

// 안내 단계·낮 투표 판정 결과 → "밤이 되었습니다" 아래 까닭 글 (밤 안내가 아니거나 재판 없이 밤이 아니면 null)
// 글은 판정 결과 표(constants/vote/ingameVoteOutcomes.js) 한곳에 둠
export function getNightReasonMsg(phase, outcome) {
  if (phase !== "NIGHT" || typeof outcome !== "string") return null
  return DAY_VOTE_OUTCOME_TEXTS[outcome]?.nightReason ?? null
}

// 확인 버튼·창 이름·덮개 이름
export const CONFIRM_LABEL = "확인"

export const DIALOG_LABEL = "단계 전환 안내"

export const BACKDROP_LABEL = "단계 전환 안내 닫기"

// 단계 → 안내 글 (낮·밤 아니면 null)
export function getEntranceMsg(phase) {
  if (phase !== "DAY" && phase !== "NIGHT") return null
  return ENTRANCE_MSGS[phase]
}

// 덮개·판·글·확인 버튼 모양
export const BACKDROP_CLASS =
  "fixed inset-0 z-[60] w-full cursor-default bg-black/70"

export const PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[61] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]"

export const PANEL_CLASS = "pointer-events-auto max-w-full"

export const MSG_CLASS =
  "font-subheading text-[clamp(1.1rem,4.4vw,2.1rem)] font-bold leading-tight tracking-wide text-[#3a1a0c]"

// 밤 안내 아래 까닭 줄 (안내 글보다 작게)
export const REASON_CLASS =
  "font-subheading text-[clamp(0.85rem,2.4vw,1.15rem)] font-semibold leading-snug text-[#3a1a0c]"

export const CONFIRM_BTN_CLASS =
  "mt-3 min-h-9 rounded border border-[#6b4321] bg-[#e2c78f] px-6 py-1.5 text-sm font-semibold tracking-wide text-[#3a1a0c] transition hover:bg-[#f0dcae] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b4321]"
