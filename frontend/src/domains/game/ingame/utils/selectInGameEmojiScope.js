import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useInGameStore } from "../store/ingameStore.js"
import { selectOwnedGameChatContext } from "./selectOwnedGameChatContext.js"

/**
 * E-3(F-33 AC-03): "지금 이 계정이 이모티콘을 보낼 수 있는 판"의 유일한 판정.
 *
 * 소유권 판정은 채팅과 **같은 선택자**(selectOwnedGameChatContext)에서 시작한다 — store에 남은
 * 이전 계정의 게임 상태를 새 계정이 자기 것으로 읽는 일을 두 기능이 다른 기준으로 막으면,
 * 한쪽에만 생긴 구멍을 알아채지 못한다. 다만 **채널 제한은 가져오지 않는다**: 채팅은 생존·
 * phase로 전송 채널이 갈리지만 이모티콘에는 채널이 없고, 사망한 참가자도 판이 끝날 때까지
 * 이모티콘을 보낼 수 있다(서버 isEligibleSessionRecipient가 alive를 보지 않는 것과 같은 계약).
 *
 * 그래서 gameId 소유권에 세 가지만 덧붙인다:
 *   - canonical phase가 ENDED가 아니다(끝난 판에 보낼 것이 없다 — 서버도 GAME_ENDED로 거부한다).
 *   - roster에 **내 행이 있다**. 없으면 이 판의 명단이 아직/이미 내 것이 아니므로 유효 scope가
 *     없다(fail-closed — 여기서 통과시키면 팔레트를 그 판의 것으로 캐시해 버린다).
 *   - 그 행의 isParticipating이 false가 아니다(이탈·배제된 참가자는 더 이상 보낼 수 없다).
 *
 * **alive=false만으로는 폐기하지 않는다.** 사망은 참여의 끝이 아니다.
 *
 * @param {{gameId?: string|null, state?: object|null}} inGame useInGameStore의 (gameId, state)
 * @param {string|null} authUuid 현재 인증 계정
 * @param {number|null} identityGeneration 현재 신원 전이 횟수
 * @returns {{accountId:string, identityGeneration:number|null, gameId:string}|null}
 */
export function selectInGameEmojiScope(inGame, authUuid, identityGeneration) {
  const { gameId } = selectOwnedGameChatContext(inGame ?? {}, authUuid)
  if (typeof gameId !== "string" || gameId.length === 0) return null

  const state = inGame?.state ?? null
  if (state?.phase === "ENDED") return null

  const players = Array.isArray(state?.players) ? state.players : []
  const selfRow = players.find((player) => player?.uuid === authUuid)
  if (!selfRow) return null
  if (selfRow.isParticipating === false) return null

  return { accountId: authUuid, identityGeneration: identityGeneration ?? null, gameId }
}

/** 지금 이 순간의 scope. 두 소비처(팔레트 조회·전송 훅)가 같은 함수를 쓴다. */
export function readInGameEmojiScope() {
  const auth = useAuthStore.getState()
  return selectInGameEmojiScope(
    useInGameStore.getState(),
    auth.user?.uuid ?? null,
    auth.identityGeneration ?? null,
  )
}

/**
 * 캐시 키 — [authUuid, identityGeneration, gameId]. scope가 없으면 null이다.
 *
 * 소켓 재연결·보드 재마운트·일반 snapshot 갱신은 이 세 값을 바꾸지 않으므로 같은 키가 되고,
 * 그래서 그런 전이로는 팔레트 캐시가 버려지지 않는다(GET이 다시 나가지 않는다).
 */
export function inGameEmojiScopeKey(scope) {
  if (scope === null || typeof scope !== "object") return null
  if (typeof scope.accountId !== "string" || scope.accountId.length === 0) return null
  if (typeof scope.gameId !== "string" || scope.gameId.length === 0) return null
  return [scope.accountId, scope.identityGeneration ?? null, scope.gameId].join("|")
}
