// 이모티콘 범위(계정·신원 세대·판) 고르기와 범위 키 만들기
// 판 보드·이모티콘 보내기 훅·이모티콘 팔레트 스토어(user)가 사용
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useInGameStore } from "../store/ingameStore.js"
import { selectOwnedGameChatContext } from "./selectOwnedGameChatContext.js"

// 내 판이고 안 끝났고 내가 참여 중일 때만 범위 (아니면 null)
export function selectInGameEmojiScope(inGame, authUuid, identityGeneration) {
  const { gameId } = selectOwnedGameChatContext(inGame ?? {}, authUuid)
  if (typeof gameId !== "string" || gameId.length === 0) return null

  const state = inGame?.state ?? null
  if (state?.phase === "ENDED") return null

  // 명단에 내 자리가 있고 참여 중이어야 함
  const players = Array.isArray(state?.players) ? state.players : []
  const selfRow = players.find((player) => player?.uuid === authUuid)
  if (!selfRow) return null
  if (selfRow.isParticipating === false) return null

  return { accountId: authUuid, identityGeneration: identityGeneration ?? null, gameId }
}

// 스토어 지금 값으로 범위 읽기 (요청 전후 비교용)
export function readEmojiScope() {
  const auth = useAuthStore.getState()
  return selectInGameEmojiScope(
    useInGameStore.getState(),
    auth.user?.uuid ?? null,
    auth.identityGeneration ?? null,
  )
}

// 범위 → 비교용 키 (계정·판이 없으면 null)
export function inGameEmojiScopeKey(scope) {
  if (scope === null || typeof scope !== "object") return null
  if (typeof scope.accountId !== "string" || scope.accountId.length === 0) return null
  if (typeof scope.gameId !== "string" || scope.gameId.length === 0) return null
  return [scope.accountId, scope.identityGeneration ?? null, scope.gameId].join("|")
}
