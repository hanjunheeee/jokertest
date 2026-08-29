/**
 * night_turn_started 방송을 검증·정규화한다. 신뢰하지 않는 외부 입력이므로 top-level 형태,
 * gameId 일치, dayIndex 일치, role 값, deadline 형태를 전부 통과해야만 정규화된 payload를
 * 돌려준다 — 하나라도 위반하면 null(완전한 no-op)이다. parseDayPhaseChangedPayload와 같은
 * 계약·같은 방어 패턴이다.
 *
 * dayIndex는 단조 증가가 아니라 "지금 보고 있는 밤과 정확히 같아야 한다"로 본다 — 역할 턴은
 * 한 밤 안에서 도는 하위 전이라 dayIndex를 전혀 바꾸지 않기 때문이다(백엔드
 * buildNightTurnStartedPayload가 session.dayIndex를 그대로 싣는다).
 *
 * role은 프런트가 아는 역할 턴만 받는다(fail-closed). 모르는 역할은 어차피 안내 문구도
 * 없어서 화면에 아무 것도 그릴 수 없으므로, canonical 상태에 눌러앉히지 않고 여기서 버린다.
 * 목록은 INGAME_NIGHT_TURN_ANNOUNCEMENTS 하나에서만 유도한다 — 역할 목록을 이 파일에 다시
 * 적으면 안내 사전과 갈라질 수 있다.
 *
 * "그 밤에 행동 가능한 역할인가"는 여기서 보지 않는다. 백엔드 NIGHT_TURN_ORDER는 생존자가
 * 없는 역할도, 아직 능력이 없는 역할도 똑같이 턴을 돌리며(그래야 턴 진행 자체가 생존·역할
 * 정보를 흘리지 않는다), 그 판정은 안내 시점의 selectInGameNightTurnRole이 dayIndex로 따로
 * 내린다. 파서가 생존·자격을 보면 죽은 역할의 턴이 걸러져 AC-06(죽은 role의 턴에도 안내가
 * 동일하게 재생된다)이 깨진다.
 *
 * deadline은 절대시각(epoch ms)이다 — 백엔드가 nowFn() + 제한시간으로 계산해 싣는다.
 *
 * @param {object} params - 검증 입력
 * @param {*} params.payload - night_turn_started 방송 원본(신뢰하지 않는 외부 입력)
 * @param {string} params.gameId - 현재 store가 신뢰 경계로 요구하는 활성 gameId
 * @param {number} params.dayIndex - 현재 store가 보고 있는 밤 인덱스
 * @flow 형태 → gameId 일치 → dayIndex 일치 → role 값 → deadline 형태를 차례로 검사하고,
 *       하나라도 어긋나면 즉시 null을 돌려준다.
 */
import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"

const KNOWN_NIGHT_TURN_ROLES = new Set(INGAME_NIGHT_TURN_ANNOUNCEMENTS.map((turn) => turn.role))

export function parseNightTurnStartedPayload({ payload, gameId, dayIndex }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, dayIndex: payloadDayIndex, role, deadline } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (!gameId || payloadGameId !== gameId) return null

  if (!Number.isInteger(payloadDayIndex)) return null
  if (!Number.isInteger(dayIndex) || payloadDayIndex !== dayIndex) return null

  if (typeof role !== "string" || !KNOWN_NIGHT_TURN_ROLES.has(role)) return null

  // 0 이하의 deadline은 계산이 어긋났다는 뜻이므로(epoch ms는 항상 양수) 받지 않는다 — 그대로
  // 두면 남은 시간이 처음부터 0인 턴이 된다.
  if (!Number.isFinite(deadline) || deadline <= 0) return null

  return { gameId: payloadGameId, dayIndex: payloadDayIndex, role, deadline }
}
