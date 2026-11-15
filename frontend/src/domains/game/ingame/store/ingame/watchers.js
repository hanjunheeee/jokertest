// 스토어·로그인 신원 감시: 상태가 바뀔 때마다 범위를 맞추고, 소속·신원이 바뀌면 낮 시작 연출을 버림
// 입구 파일이 create 뒤에 한 번씩 부름
import { useAuthStore } from "../../../../auth/store/auth.store.js"
import { CLEARED_DAWN_REPORT } from "../../constants/store/ingameStore.js"
import { adoptIdentityScope, getMembershipEpoch } from "./identityScope.js"
import { getCommittingReceipt } from "./receiptScope.js"
import { noteWinResult } from "./terminalScope.js"

// 남은 낮 시작 연출 지우기 (옛 소속·옛 계정이 받은 연출을 새 쪽에 안 틀기)
function dropDawnReport(store) {
  if (store.getState().dawnReport === null) return
  store.setState(CLEARED_DAWN_REPORT)
}

// 스토어 바뀔 때마다: 신원 범위 맞추기, 종료 결과 범위 적기
export function watchStore(store) {
  store.subscribe((next) => {
    const epochBefore = getMembershipEpoch()
    adoptIdentityScope(next.gameId ?? null, next.state ?? null)
    if (getMembershipEpoch() !== epochBefore) dropDawnReport(store)

    noteWinResult(next, getCommittingReceipt())
  })
}

// 로그인 신원 세대가 바뀌면 낮 시작 연출을 버림
export function watchAuth(store) {
  let seen = useAuthStore.getState().identityGeneration ?? null
  useAuthStore.subscribe((state) => {
    const next = state.identityGeneration ?? null
    if (next === seen) return
    seen = next
    dropDawnReport(store)
  })
}
