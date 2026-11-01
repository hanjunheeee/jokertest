// 인게임 스토어 입구: create 하고 액션 묶음·범위 감시를 붙임
// 인게임 화면·훅·시험, 매칭 방 훅이 여기서 가져다 씀 (나눈 파일은 store/ingame/)
import { create } from "zustand"
import { initialState } from "./ingame/initialState.js"
import { sessionActions } from "./ingame/sessionActions.js"
import { phaseActions } from "./ingame/phaseActions.js"
import { voteActions } from "./ingame/voteActions.js"
import { snapshotActions } from "./ingame/snapshotActions.js"
import { nightResultActions } from "./ingame/nightResultActions.js"
import { bindStore } from "./ingame/storeRef.js"
import { adoptIdentityScope } from "./ingame/identityScope.js"
import { watchConnection } from "./ingame/connectionScope.js"
import { watchAuth, watchStore } from "./ingame/watchers.js"

// 소켓 바뀜 구독은 스토어 만들기 전에 시작 (처음 소켓도 세대 1로 잡음)
watchConnection()

export const useInGameStore = create((set) => ({
  ...initialState,
  ...sessionActions(set),
  ...phaseActions(set),
  ...voteActions(set),
  ...snapshotActions(set),
  ...nightResultActions(set),
}))

// 만든 뒤 순서: 손잡이 묶기 → 빈 신원 범위 잡기 → 스토어 감시 → 로그인 신원 감시
bindStore(useInGameStore)
adoptIdentityScope(null, null)
watchStore(useInGameStore)
watchAuth()

export { getIdentityScopeVersion, subscribeIdentityScope } from "./ingame/identityScope.js"
export { noteConnectionRebound } from "./ingame/connectionScope.js"
export { readInGameReceiptScope } from "./ingame/receiptScope.js"
export { isTerminalResultFromOtherAccount } from "./ingame/terminalScope.js"
export { readNightSuccessReceiptScope } from "./ingame/nightSuccessRecords.js"
export { selectInGameState, selectNightPresentationWait, selectNightSuccessQueue } from "./ingame/initialState.js"
export { isCurrentGameKickEvent, isSameReceiptScope } from "../utils/store/scope.js"
