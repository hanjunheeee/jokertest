/**
 * DAY/NIGHT 진입 연출(phase entrance) 문구와 레이아웃.
 *
 * canonical phase가 실제로 DAY 또는 NIGHT로 바뀐 "그 순간"에 한 번 보여주는 표시 전용
 * 연출이다 — 소켓 emit·REST·canonical store 변경이 전혀 없고, 닫아도 서버의 phase·역할 턴은
 * 조금도 움직이지 않는다(useInGamePhaseEntrance 참고).
 *
 * 배경은 역할 공개·밤 역할 턴 안내와 같은 공용 파치먼트 셸을 그대로 쓴다 — 이 파일은
 * 파치먼트 이미지 URL을 다시 정의하지 않는다(ingameParchmentLayout.js 하나만이 소유).
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

/**
 * 오버레이 레이아웃.
 *
 * backdrop은 게임 화면 위를 완전히 덮어 포인터 입력을 흡수한다 — 아래 게임 표면(투표·채팅·
 * 재판·밤 행동·결과 컨트롤)과의 상호작용을 연출이 떠 있는 동안 차단하기 위한 것이다.
 * 역할 공개(z-50대)보다는 아래, 사망 연출(z-70대)보다도 아래에 놓아 우선순위 겹침이
 * 생기더라도 렌더 순서가 아니라 명시적인 z 단계로 결정되게 한다.
 */
export const INGAME_PHASE_ENTRANCE_BACKDROP_CLASS =
  "fixed inset-0 z-[60] w-full cursor-default bg-black/70"

export const INGAME_PHASE_ENTRANCE_PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[61] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]"

export const INGAME_PHASE_ENTRANCE_PANEL_CLASS = "pointer-events-auto max-w-full"

export const INGAME_PHASE_ENTRANCE_MESSAGE_CLASS =
  "font-subheading text-[clamp(1.1rem,4.4vw,2.1rem)] font-bold leading-tight tracking-wide text-[#3a1a0c]"

export const INGAME_PHASE_ENTRANCE_CONFIRM_BUTTON_CLASS =
  "mt-3 min-h-9 rounded border border-[#6b4321] bg-[#e2c78f] px-6 py-1.5 text-sm font-semibold tracking-wide text-[#3a1a0c] transition hover:bg-[#f0dcae] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b4321]"
