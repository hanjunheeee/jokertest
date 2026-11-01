// 알림 스토어 처음 상태·로그인 계정 읽기
// 알림 스토어 입구와 계정 액션이 씀
import { useAuthStore } from "../../../auth/store/auth.store.js"

// 계정이 바뀌면 통째로 비우는 부분
export const initialAccountState = () => ({
  status: "idle",
  error: null,
  items: [],
  soundSeen: new Set(),
  snapshotLoaded: false,
  restorePending: false,
  liveBuffer: [],
  open: false,
  readPendingIds: [],
  readErrors: {},
  deleteReadPending: false,
  deleteReadError: null,
  readyState: "idle",
})

// 계정 세대·요청 세대까지 넣은 전체 처음 상태
export const initialState = () => ({
  accountId: null,
  accountGeneration: 0,
  requestGeneration: 0,
  ...initialAccountState(),
})

// 로그인 중일 때만 uuid, 아니면 null
export function readAuthAccountId() {
  const auth = useAuthStore.getState()
  return auth.isLoggedIn && typeof auth.user?.uuid === "string" && auth.user.uuid.length > 0
    ? auth.user.uuid
    : null
}
