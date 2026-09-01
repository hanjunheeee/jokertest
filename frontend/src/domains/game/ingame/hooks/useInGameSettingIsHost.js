import { useAuthStore } from "../../../auth/store/auth.store.js"
import { INGAME_SETTING_PREVIEW_AS_HOST } from "../constants/controls/ingameSetting/ingameSettingData.js"
import { useInGameStore } from "../store/ingameStore.js"

/**
 * 방관리 탭 노출 여부.
 * game_started 시 matchingStore.hostUuid를 ingameStore에 넘겨 auth uuid와 비교한다.
 * TODO: GameSession payload·snapshot에 hostUuid가 실리면 그쪽을 우선한다.
 */
export function useInGameSettingIsHost() {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const hostUuid = useInGameStore((s) => s.hostUuid)

  if (hostUuid && authUuid) return authUuid === hostUuid
  return INGAME_SETTING_PREVIEW_AS_HOST
}
