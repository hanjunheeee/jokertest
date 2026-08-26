/**
 * E2E 자동화가 화면을 기계 판독할 때 쓰는 data 속성의 단일 원천.
 *
 * 표시에는 아무 영향이 없다 — 클래스·문구·레이아웃을 건드리지 않고 속성만 얹는다.
 * 이름을 이 파일 하나가 소유하므로 프런트 컴포넌트와 e2e 셀렉터가 같은 모듈을 읽고,
 * 이름이 어긋나면 컴파일이 아니라 테스트에서 곧바로 드러난다.
 *
 * 노출 범위 원칙: 이미 그 창의 화면에 떠 있는 값만 싣는다.
 * - phase/dayIndex/self.role은 컨트롤 패널 헤더가 이미 텍스트로 보여주는 값이다.
 * - 플레이어 카드에는 닉네임·생존 상태·본인 여부만 싣는다 — 다른 참가자의 role/team은
 *   어떤 빌더도 받지 않으므로 실수로도 새어나갈 수 없다.
 */

/** 속성 이름 사전. e2e 셀렉터는 이 값들로만 셀렉터 문자열을 만든다. */
export const INGAME_E2E_ATTRS = Object.freeze({
  phase: "data-ingame-phase",
  dayIndex: "data-ingame-day-index",
  selfRole: "data-ingame-self-role",
  playerNickname: "data-ingame-player-nickname",
  playerStatus: "data-ingame-player-status",
  playerSelf: "data-ingame-player-self",
  targetId: "data-ingame-target-id",
})

/**
 * 비어 있지 않은 문자열인지 판정한다.
 * @param {unknown} value 검사할 값
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0
}

/**
 * 컨트롤 패널(aside)에 얹을 canonical phase·dayIndex·본인 역할 속성을 만든다.
 * @param {object|null|undefined} gameState canonical 게임 상태({ phase, dayIndex, self })
 * @flow 값이 기대한 형태가 아닌 키는 결과에 아예 넣지 않는다 — undefined 속성이 DOM에
 *   "빈 문자열"로 새어나가면 e2e가 "값이 있는데 비었다"로 오독하기 때문이다.
 * @returns {object} 전개해서 그대로 JSX 속성으로 쓸 수 있는 객체
 */
export function buildInGameControlPanelE2eAttrs(gameState) {
  if (gameState === null || typeof gameState !== "object" || Array.isArray(gameState)) return {}

  const attrs = {}
  if (isNonEmptyString(gameState.phase)) attrs[INGAME_E2E_ATTRS.phase] = gameState.phase
  if (Number.isInteger(gameState.dayIndex)) attrs[INGAME_E2E_ATTRS.dayIndex] = String(gameState.dayIndex)
  if (isNonEmptyString(gameState.self?.role)) attrs[INGAME_E2E_ATTRS.selfRole] = gameState.self.role
  return attrs
}

/**
 * 플레이어 카드에 얹을 닉네임·생존 상태·본인 여부 속성을 만든다.
 * @param {{nickname?: string, status?: string, isSelf?: boolean}} params 카드가 이미 그리고 있는 값들
 * @flow 세 값은 서로 독립이라 각각 형태가 맞을 때만 개별로 실린다. role/team은 애초에
 *   인자로 받지 않으므로 어떤 입력으로도 결과에 나타나지 않는다.
 * @returns {object} 전개해서 그대로 JSX 속성으로 쓸 수 있는 객체
 */
export function buildInGamePlayerCardE2eAttrs({ nickname, status, isSelf } = {}) {
  const attrs = {}
  if (isNonEmptyString(nickname)) attrs[INGAME_E2E_ATTRS.playerNickname] = nickname
  if (isNonEmptyString(status)) attrs[INGAME_E2E_ATTRS.playerStatus] = status
  if (typeof isSelf === "boolean") attrs[INGAME_E2E_ATTRS.playerSelf] = isSelf ? "true" : "false"
  return attrs
}

/**
 * 밤 행동·낮 투표 대상 버튼에 얹을 대상 uuid 속성을 만든다.
 * @param {{id?: string}} player InGameTargetPicker가 받은 대상 항목(id는 canonical uuid)
 * @flow id가 비어 있으면 속성 자체를 만들지 않는다 — 빈 값으로 잡히는 셀렉터가 생기면
 *   "아무 대상이나" 눌러버리는 오작동이 된다.
 * @returns {object} 전개해서 그대로 JSX 속성으로 쓸 수 있는 객체
 */
export function buildInGameTargetE2eAttrs(player) {
  if (player === null || typeof player !== "object" || Array.isArray(player)) return {}
  if (!isNonEmptyString(player.id)) return {}
  return { [INGAME_E2E_ATTRS.targetId]: player.id }
}
