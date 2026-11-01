import { useAuthStore } from "../../../auth/store/auth.store.js"
import { PREVIEW_AS_HOST } from "../constants/controls/ingameSetting/ingameSettingData.js"
import { useInGameStore } from "../store/ingameStore.js"

export function useInGameSettingIsHost() {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const hostUuid = useInGameStore((s) => s.hostUuid)
  const gameId = useInGameStore((s) => s.gameId)

  if (hostUuid && authUuid) return authUuid === hostUuid
  if (gameId) return false
  return PREVIEW_AS_HOST
}
