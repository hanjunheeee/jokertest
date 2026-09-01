/**
 * DAY/NIGHT 진입 연출(phase entrance) 문구와 본문 레이아웃.
 *
 * 셸·확인 버튼·z-index는 constants/parchment/ingameParchmentModalVariants.js가 담당한다.
 */

/** 진입 연출을 보여주는 canonical phase — 이 둘 외에는 어떤 연출도 만들지 않는다. */
export const INGAME_PHASE_ENTRANCE_PHASES = Object.freeze(["DAY", "NIGHT"])

/** phase별 본문 문구(정확히 이 문자열이 화면에 나가야 한다). */
export const INGAME_PHASE_ENTRANCE_MESSAGES = Object.freeze({
  DAY: "낮이 되었습니다",
  NIGHT: "밤이 되었습니다",
})

/** 확인(닫기) 버튼 문구 — 역할 공개/밤 안내와 동일한 관례. */
export const INGAME_PHASE_ENTRANCE_CONFIRM_LABEL = "확인"

/** 오버레이 전체를 감싸는 dialog의 접근성 라벨. */
export const INGAME_PHASE_ENTRANCE_DIALOG_LABEL = "단계 전환 안내"

/** 뒤 배경(게임 화면)을 눌러 닫을 수 있는 backdrop 버튼의 접근성 라벨. */
export const INGAME_PHASE_ENTRANCE_BACKDROP_LABEL = "단계 전환 안내 닫기"

/**
 * 해당 phase의 진입 문구를 돌려준다. DAY/NIGHT가 아니면 null이다(호출부가 연출을 그리지 않는다).
 */
export function getInGamePhaseEntranceMessage(phase) {
  if (phase !== "DAY" && phase !== "NIGHT") return null
  return INGAME_PHASE_ENTRANCE_MESSAGES[phase]
}

export const INGAME_PHASE_ENTRANCE_MESSAGE_CLASS =
  "font-subheading text-[clamp(1.1rem,4.4vw,2.1rem)] font-bold leading-tight tracking-wide text-[#3a1a0c]"
