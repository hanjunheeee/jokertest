/**
 * data 훅 이름에서 Playwright CSS 셀렉터 문자열을 만드는 순수 함수 모음.
 *
 * 속성 이름은 프런트가 소유한 단일 원천(INGAME_E2E_ATTRS)에서만 읽는다 — 이 파일이 이름을
 * 다시 적지 않으므로 프런트에서 이름을 바꾸면 여기 셀렉터도 자동으로 따라간다.
 * 오버레이 3종의 data 속성은 이 슬라이스 이전부터 프로덕션에 있던 것이라 문자열 상수로 둔다.
 */
import { INGAME_E2E_ATTRS } from "../../frontend/src/domains/game/ingame/constants/e2e/ingameE2eHooks.js"

/** 이 슬라이스 이전부터 프로덕션 오버레이가 달고 있는 data 속성 이름. */
export const OVERLAY_ATTRS = Object.freeze({
  phaseEntrance: "data-ingame-phase-entrance",
  killReveal: "data-ingame-kill-reveal",
  nightPrivateResult: "data-ingame-night-private-result",
})

/**
 * CSS 속성 선택자의 값 자리에 안전하게 넣을 수 있도록 인용부호를 이스케이프한다.
 * @param {string} value 속성 값(닉네임처럼 사용자가 정한 문자열이 들어올 수 있다)
 * @flow 역슬래시를 먼저 escape한 뒤 큰따옴표를 escape한다 — 순서가 뒤바뀌면 이미 넣은
 *   역슬래시를 다시 escape해 값이 달라진다.
 */
export function escapeAttrValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/**
 * 속성 이름과 값으로 CSS 속성 선택자를 만든다.
 * @param {string} name 속성 이름
 * @param {string|undefined} value 속성 값(생략하면 "속성이 있기만 하면" 선택자가 된다)
 */
function attrSelector(name, value) {
  if (value === undefined || value === null) return `[${name}]`
  return `[${name}="${escapeAttrValue(value)}"]`
}

/** canonical phase/dayIndex를 들고 있는 컨트롤 패널(세션이 있을 때만 존재한다). */
export function controlPanel() {
  return attrSelector(INGAME_E2E_ATTRS.phase)
}

/**
 * 특정 phase(그리고 선택적으로 dayIndex)인 컨트롤 패널.
 * @param {string} phase canonical phase(ROLE_REVEAL/DAY/NIGHT/TRIBUNAL/ENDED)
 * @param {number} [dayIndex] canonical dayIndex — 넘기면 함께 대조한다
 * @flow dayIndex를 넘기지 않으면 phase만 보는 셀렉터가 된다.
 */
export function controlPanelWithPhase(phase, dayIndex) {
  const base = attrSelector(INGAME_E2E_ATTRS.phase, phase)
  if (dayIndex === undefined || dayIndex === null) return base
  return `${base}${attrSelector(INGAME_E2E_ATTRS.dayIndex, String(dayIndex))}`
}

/**
 * 컨트롤 패널이 노출하는 본인 역할.
 * @param {string} role 기대하는 역할 이름
 */
export function controlPanelWithSelfRole(role) {
  return attrSelector(INGAME_E2E_ATTRS.selfRole, role)
}

/**
 * 닉네임으로 지목하는 플레이어 보드 카드.
 * @param {string} nickname 카드에 표시된 닉네임
 */
export function playerCard(nickname) {
  return attrSelector(INGAME_E2E_ATTRS.playerNickname, nickname)
}

/**
 * 사망 상태로 표시된 플레이어 보드 카드.
 * @param {string} nickname 카드에 표시된 닉네임
 */
export function deadPlayerCard(nickname) {
  return `${playerCard(nickname)}${attrSelector(INGAME_E2E_ATTRS.playerStatus, "dead")}`
}

/** 이 창의 본인 카드 — 창과 계정이 어긋나지 않았는지 확인하는 데 쓴다. */
export function selfPlayerCard() {
  return attrSelector(INGAME_E2E_ATTRS.playerSelf, "true")
}

/**
 * uuid로 지목하는 밤 행동·낮 투표 대상 버튼.
 * @param {string} uuid canonical 참가자 uuid
 */
export function nightTarget(uuid) {
  return attrSelector(INGAME_E2E_ATTRS.targetId, uuid)
}

/** 대상 버튼 전체 — 좌석↔uuid 표를 만들 때 훑는다. */
export function anyTarget() {
  return attrSelector(INGAME_E2E_ATTRS.targetId)
}

/**
 * DAY/NIGHT 진입 연출 오버레이.
 * @param {string} [phase] 기대하는 phase — 생략하면 아무 진입 연출이나 잡는다
 */
export function phaseEntrance(phase) {
  return attrSelector(OVERLAY_ATTRS.phaseEntrance, phase)
}

/** 사망 연출 오버레이(값은 reveal id라 존재 여부만 본다). */
export function killReveal() {
  return attrSelector(OVERLAY_ATTRS.killReveal)
}

/**
 * 개인 조사·확인 결과 오버레이.
 * @param {string} [kind] "INVESTIGATE" 또는 "CONFIRM" — 생략하면 둘 다 잡는다
 */
export function nightPrivateResult(kind) {
  return attrSelector(OVERLAY_ATTRS.nightPrivateResult, kind)
}
