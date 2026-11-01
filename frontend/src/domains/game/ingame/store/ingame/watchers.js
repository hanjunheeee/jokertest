// 스토어·로그인 신원 감시: 상태가 바뀔 때마다 범위를 맞추고 옛 연출을 버림
// 입구 파일이 create 뒤에 한 번씩 부름
import { useAuthStore } from "../../../../auth/store/auth.store.js"
import { isWaitLive } from "../../utils/store/nightPresentationWait.js"
import { adoptIdentityScope, getMembershipEpoch } from "./identityScope.js"
import { cancelRecords } from "./nightSuccessRecords.js"
import { getCommittingReceipt } from "./receiptScope.js"
import { noteWinResult } from "./terminalScope.js"

// 스토어 바뀔 때마다: 신원 범위 맞추기, 끝난 연출 대기 지우기, 종료 결과 범위 적기
export function watchStore(store) {
  store.subscribe((next) => {
    // 소속 세대가 바뀌면 옛 소속의 밤 성공 기록을 버림
    const epochBefore = getMembershipEpoch()
    adoptIdentityScope(next.gameId ?? null, next.state ?? null)
    if (getMembershipEpoch() !== epochBefore) cancelRecords()

    // 그 밤이 지났는데 대기가 남아 있으면 지움
    if (next.nightPresentationWait !== null
      && !isWaitLive(next.nightPresentationWait, next.gameId ?? null, next.state ?? null)) {
      store.setState({ nightPresentationWait: null })
    }

    noteWinResult(next, getCommittingReceipt())
  })
}

// 로그인 신원 세대가 바뀌면 밤 성공 기록을 버림
export function watchAuth() {
  let seen = useAuthStore.getState().identityGeneration ?? null
  useAuthStore.subscribe((state) => {
    const next = state.identityGeneration ?? null
    if (next === seen) return
    seen = next
    cancelRecords()
  })
}
