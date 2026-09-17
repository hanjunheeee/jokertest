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
 * 방장 정보든 로그인 정보든 하나라도 없으면 방장으로 보지 않는다(fail-closed).
 *
 * F-21(AC-01): 이제 서버가 game_started와 get_session_snapshot 양쪽에 hostUuid를 싣는다 —
 * 새로고침으로 스냅샷만으로 복원된 세션도 정상 경로로 판정된다.
 *
 * 그리고 **실제 게임이 있는 동안에는 미리보기 fallback을 쓰지 않는다.** 예전에는 hostUuid나
 * 인증 정보가 없을 때 INGAME_SETTING_PREVIEW_AS_HOST로 떨어졌는데, 그 상수는 게임 없이
 * 화면만 보는 미리보기를 위한 값이라 실제 판이 돌아가는 중에 쓰면 "모른다"가 "방장이다"가
 * 된다 — 미리보기 값으로 실제 권한을 만들지 않는다. 서버는 어차피 모든 추방 요청의 권한을
 * 다시 판정하므로 이 값은 화면 노출만 결정하지만, 그렇다고 잘못된 버튼을 띄울 이유는 없다.
 */
export function useInGameSettingIsHost() {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const hostUuid = useInGameStore((s) => s.hostUuid)
  const gameId = useInGameStore((s) => s.gameId)

  if (hostUuid && authUuid) return authUuid === hostUuid
  if (gameId) return false
  return INGAME_SETTING_PREVIEW_AS_HOST
}
