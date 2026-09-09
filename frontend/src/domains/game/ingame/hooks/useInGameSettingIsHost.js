import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useMatchingStore } from "../../matching/store/matchingStore.js"
import { INGAME_SETTING_PREVIEW_AS_HOST } from "../constants/controls/ingameSetting/ingameSettingData.js"

/**
 * 방관리 탭 노출 여부.
 *
 * 원격 UI는 ingameStore.hostUuid를 읽지만 이 브랜치의 GameSession payload·snapshot에는
 * hostUuid가 없다(backend buildGameStartedPayload 계약). 그래서 방 단계에서 서버가 내려준
 * matchingStore의 방장 정보를 그대로 본다 — useMatchingRoom의 game_started 핸들러가
 * 인게임 진입 직후 clearRoom()을 부르므로 hostUuid는 그때 비워지고, clearRoom이 건드리지
 * 않는 lastHostUuid가 마지막으로 알던 방장을 남긴다(matchingStore 참고).
 *
 * 방장 정보든 로그인 정보든 하나라도 없으면 방장으로 보지 않는다(fail-closed).
 * TODO: GameSession payload·snapshot에 hostUuid가 실리면 그쪽을 우선한다.
 */
export function useInGameSettingIsHost() {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const hostUuid = useMatchingStore((s) => s.hostUuid ?? s.lastHostUuid)

  if (hostUuid && authUuid) return authUuid === hostUuid
  return INGAME_SETTING_PREVIEW_AS_HOST
}
