// 알림 스토어 계정·세대·다시 맞추기 액션
// notifications.store.js가 create 안에서 펼쳐 씀
import { initialAccountState, initialState, readAuthAccountId } from "./state.js"

// 계정 맞추기 액션 묶음, 계정 세대는 늦게 온 이전 계정 응답을 버리는 기준
export const accountActions = (set, get) => ({
  // 계정이 바뀌었을 때만 비우고 세대 올림
  syncAccount: () => {
    const next = readAuthAccountId()
    const state = get()
    if (state.accountId === next) return state.accountGeneration

    const accountGeneration = state.accountGeneration + 1
    set({
      accountId: next,
      accountGeneration,
      requestGeneration: state.requestGeneration + 1,
      ...initialAccountState(),
    })
    return accountGeneration
  },

  // 요청 세대는 넘겼을 때만 같이 봄
  isCurrent: (accountGeneration, requestGeneration) => {
    const state = get()
    if (state.accountGeneration !== accountGeneration) return false
    if (requestGeneration !== undefined && state.requestGeneration !== requestGeneration) return false
    return true
  },

  // 다시 연결되면 복원 전 상태로 돌리고 ready 다시 보내게 함
  beginResync: () =>
    set({ snapshotLoaded: false, restorePending: true, liveBuffer: [], readyState: "pending" }),

  // ready 진행 표시 (pending·sent·retry), ready 동기화가 바꿈
  setReadyState: (readyState) => set({ readyState }),

  // 시험용 처음 상태로 되돌리기
  __resetForTests: () => set(initialState()),
})
