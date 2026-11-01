// 설정 방장 여부 훅: 내가 이 판 방장인지 (판이 없을 땐 미리보기 값)
// 설정 창 내용(SettingPanelContent)이 방장 탭 보이기에 사용
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { PREVIEW_AS_HOST } from "../constants/controls/ingameSetting/ingameSettingData.js"
import { useInGameStore } from "../store/ingameStore.js"

// 방장 id·내 id가 다 있으면 비교, 판만 있으면 아님, 판도 없으면 미리보기 값
export function useInGameSettingIsHost() {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const hostUuid = useInGameStore((s) => s.hostUuid)
  const gameId = useInGameStore((s) => s.gameId)

  if (hostUuid && authUuid) return authUuid === hostUuid
  if (gameId) return false
  return PREVIEW_AS_HOST
}
