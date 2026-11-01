// 카드 메뉴 지금 범위 읽기: 판·계정·신원·단계·날짜·회차·밤 차례
// 카드 메뉴 훅의 고르기·제출 직전 확인이 사용
import { useAuthStore } from "../../../../auth/store/auth.store.js"
import { getInGameIdentityScopeVersion, useInGameStore } from "../../store/ingameStore.js"
import { getDayVoteRound } from "../../utils/dayVoteRound.js"
import { selectInGameNightTurnRole } from "../../utils/selectInGameNightTurnRole.js"

// 렌더 값이 아니라 스토어의 지금 값으로 읽음
export function readMenuScope() {
  const store = useInGameStore.getState()
  const liveGameState = store.state ?? null
  const auth = useAuthStore.getState()
  return {
    gameId: store.gameId ?? null,
    authUuid: auth.user?.uuid ?? null,
    identityGeneration: auth.identityGeneration ?? null,
    identityScopeVersion: getInGameIdentityScopeVersion(),
    phase: liveGameState?.phase ?? null,
    dayPhase: liveGameState?.dayPhase ?? null,
    dayIndex: liveGameState?.dayIndex ?? null,
    dayVoteRound: getDayVoteRound(liveGameState),
    nightTurnRole: selectInGameNightTurnRole(liveGameState),
  }
}
