import { resolveInGameChatSendChannel, resolveInGameChatViewChannel } from "./inGameChatChannel.js"

/** 소유자가 확정되지 않았을 때 돌려주는 값 — 어떤 채널도, 어떤 gameId도 없다(fail-closed). */
const EMPTY_CONTEXT = Object.freeze({ gameId: null, viewChannel: null, sendChannel: null })

/**
 * 인게임 store가 들고 있는 (gameId, state)가 "지금 로그인한 계정의 것"일 때만 채팅 맥락을
 * 만들어 주는 순수 함수다(getInGameRoleRevealInfo와 동일한 소유권 판정 — self.uuid가 인증된
 * uuid와 같아야 한다).
 *
 * 계정만 갈아끼우면 store에는 아직 이전 계정의 게임 상태가 그대로 남아 있을 수 있다. 그
 * 상태에서 gameId·생존 여부·phase를 그대로 읽으면, 새 계정이 이전 계정의 게임에 묶인 채팅
 * 화면(전송 가능한 채널·수신 게이팅 기준)을 얻게 된다. 그래서 소유자가 확정되지 않으면
 * gameId와 두 채널을 모두 null로 돌려주고, 호출부는 전송도 수신도 하지 않는다.
 *
 * 소유자가 확정되면 채널 유도는 기존 규칙 그대로다 — 보기 채널은 canonical self.alive에서,
 * 전송 채널은 생존 여부와 phase에서 유도된다(권한의 원천은 언제나 서버다).
 */
export function selectOwnedGameChatContext({ gameId, state } = {}, authUuid) {
  if (typeof authUuid !== "string" || authUuid.length === 0) return EMPTY_CONTEXT
  if (typeof gameId !== "string" || gameId.length === 0) return EMPTY_CONTEXT
  if (state === null || typeof state !== "object" || Array.isArray(state)) return EMPTY_CONTEXT
  if (state.self?.uuid !== authUuid) return EMPTY_CONTEXT

  return {
    gameId,
    viewChannel: resolveInGameChatViewChannel(state),
    sendChannel: resolveInGameChatSendChannel(state),
  }
}
