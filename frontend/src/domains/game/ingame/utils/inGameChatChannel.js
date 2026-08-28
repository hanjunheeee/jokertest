import { selectInGameSelfAlive } from "./selectInGameSelfAlive.js"

/**
 * 서버 game-core의 CHAT_CHANNELS(DAY/DEAD)와 값이 일치해야 한다 — 이 저장소에는 백엔드/프런트가
 * 공유하는 상수 모듈이 없어 수동으로 동기화한다(sanitizeJokerChatText.js와 동일한 관례).
 * JOKER 비밀 채팅은 별도 이벤트·별도 자격 판정(isJokerNightChatEligible)을 그대로 쓰므로 이
 * 목록에 없다.
 */
export const INGAME_CHAT_CHANNELS = Object.freeze({ DAY: "DAY", DEAD: "DEAD" })

// 사망자 전용 채팅이 열려 있는 phase.
//
// 서버 game-core의 DEAD_CHAT_PHASES는 아직 NIGHT을 포함한다 — "밤에는 사망자가 어떤 채팅도
// 보거나 보낼 수 없다"는 규칙을 표시 계층인 프런트가 먼저 적용하는 단계이고, 서버 라우팅
// 동기화는 이 슬라이스 범위 밖이다(다음 슬라이스에서 서버 집합에서도 NIGHT을 빼야 한다).
// 그때까지 두 집합은 의도적으로 갈려 있다.
const DEAD_CHAT_PHASES = new Set(["DAY", "TRIBUNAL"])

/**
 * "지금 이 클라이언트가 실제로 보낼 수 있는 채널"을 canonical 상태에서만 유도한다(순수 함수).
 * 생존자는 DAY에서만, 사망자는 DAY/TRIBUNAL에서만 보낼 수 있다 — 밤에는 사망자도 보낼 수
 * 없다. 보낼 수 없으면 null이다.
 *
 * 이 판정은 UI 편의(버튼 비활성화)를 위한 것이고 권한의 원천이 아니다 — 서버가 같은 규칙을
 * 인증 uuid 기준으로 독립적으로 재검증한다. 사용자가 채널을 고르는 입력은 어디에도 없다.
 * @param {object} state - canonical 인게임 state(phase와 roster 생존 여부만 읽는다)
 * @flow 생존 여부가 미확정이면 null(fail-closed) → 생존자면 DAY만 → 사망자면 DEAD_CHAT_PHASES만
 */
export function resolveInGameChatSendChannel(state) {
  const alive = selectInGameSelfAlive(state)
  if (alive === null) return null

  if (alive) {
    return state?.phase === "DAY" ? INGAME_CHAT_CHANNELS.DAY : null
  }
  return DEAD_CHAT_PHASES.has(state?.phase) ? INGAME_CHAT_CHANNELS.DEAD : null
}

/**
 * "지금 이 클라이언트가 실제로 볼 수 있는 채널"을 canonical 상태에서만 유도한다(순수 함수).
 * 전송 가능 여부와 분리돼 있다 — 생존자는 NIGHT/TRIBUNAL에서도 공개 DAY 채팅 내역을 계속
 * 보지만 보내지는 못한다(resolveInGameChatSendChannel이 null을 준다).
 *
 * 사망이 확정되는 순간(canonical self.alive === false) 보기 채널은 DEAD로 바뀌므로, 그 이후에는
 * 공개/JOKER 메시지가 화면에 남지 않는다. 다만 밤에는 사망자에게 어떤 채널도 열지 않는다 —
 * 열람까지 막아야 "사망자는 밤 동안 어떤 채팅도 보거나 보낼 수 없다"가 성립한다(채널이 null이면
 * 수신은 shouldAcceptGameChatMessage가 버리고 화면은 selectGameChatView가 마스킹한다). 낮에
 * 쌓인 DEAD 메시지는 reducer 상태에 남아 다음 낮에 다시 보인다 — 열람 차단은 밤 동안만이다.
 * 생존 여부를 아직 모르면(null) 어떤 채널도 열지 않는다(fail-closed).
 * @param {object} state - canonical 인게임 state(phase와 roster 생존 여부만 읽는다)
 * @flow 생존 여부가 미확정이면 null → 생존자는 항상 DAY → 사망자는 NIGHT이면 null, 그 외 DEAD
 */
export function resolveInGameChatViewChannel(state) {
  const alive = selectInGameSelfAlive(state)
  if (alive === null) return null
  if (alive) return INGAME_CHAT_CHANNELS.DAY
  return state?.phase === "NIGHT" ? null : INGAME_CHAT_CHANNELS.DEAD
}
