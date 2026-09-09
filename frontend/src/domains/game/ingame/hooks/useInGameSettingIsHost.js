import { useAuthStore } from "../../../auth/store/auth.store.js"
import { INGAME_SETTING_PREVIEW_AS_HOST } from "../constants/controls/ingameSetting/ingameSettingData.js"
import { useInGameStore } from "../store/ingameStore.js"

/**
 * 방관리 탭 노출 여부.
 *
 * 방장 정보는 지금 진행 중인 게임 세션에 묶인 값(ingameStore.hostUuid)만 본다 — game_started를
 * 받은 useMatchingRoom이 그 시점 방의 hostUuid를 setGamePayload에 함께 넘기고, clearGame이
 * gameId·state와 함께 비운다. 방 단계의 matchingStore는 보지 않는다: 그 값은 이 세션과
 * 연결돼 있지 않아 방이 지워지거나(clearRoom) 방장이 사라진(updateHost(null)) 뒤에도 남은
 * 옛 방장 정보로 방관리 탭을 열어줄 수 있다.
 *
 * 방장 정보든 로그인 정보든 하나라도 없으면 방장으로 보지 않는다(fail-closed) — 새로고침 뒤
 * 스냅샷으로만 복원된 세션은 서버가 hostUuid를 보내지 않아 항상 이 경로로 떨어진다.
 * TODO: GameSession payload·snapshot에 hostUuid가 실리면 그쪽을 우선한다.
 */
export function useInGameSettingIsHost() {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const hostUuid = useInGameStore((s) => s.hostUuid)

  if (hostUuid && authUuid) return authUuid === hostUuid
  return INGAME_SETTING_PREVIEW_AS_HOST
}
