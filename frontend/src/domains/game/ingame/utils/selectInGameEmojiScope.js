import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useInGameStore } from "../store/ingameStore.js"
import { selectOwnedGameChatContext } from "./selectOwnedGameChatContext.js"

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

export function readInGameEmojiScope() {
  const auth = useAuthStore.getState()
  return selectInGameEmojiScope(
    useInGameStore.getState(),
    auth.user?.uuid ?? null,
    auth.identityGeneration ?? null,
  )
}

export function inGameEmojiScopeKey(scope) {
  if (scope === null || typeof scope !== "object") return null
  if (typeof scope.accountId !== "string" || scope.accountId.length === 0) return null
  if (typeof scope.gameId !== "string" || scope.gameId.length === 0) return null
  return [scope.accountId, scope.identityGeneration ?? null, scope.gameId].join("|")
}
