// 경제 스토어 처음 상태와 지금 로그인 계정 읽기
// economy.store.js와 economy/ 아래 액션 파일이 씀
import { useAuthStore } from "../../../auth/store/auth.store.js"

// 지금 로그인 계정 uuid, 없으면 null
export const resolveUserId = () => useAuthStore.getState().user?.uuid ?? null

// 장착 상태 처음 값, revision은 서버 버전(충돌 확인용)
const initialLoadout = {
  selectedProfilePhotoId: null,
  selectedProfileBorderId: null,
  selectedCardFrameId: null,
  selectedSkinsByJob: null,
  revision: null,
}

// 계정 바뀌거나 초기화하면 이 값으로 되돌림
export const initialState = {
  balanceGold: 0,
  balanceDiamond: 0,
  entitlements: [],
  loadout: initialLoadout,
  status: "idle",
  error: null,
  pendingPurchases: {},
}

// 계정 바뀜·늦은 응답을 가리는 순번 (초기화로 지우지 않음)
export const initialSeqs = {
  requestGeneration: 0,
  loadoutAttemptSeq: 0,
  summaryRequestSeq: 0,
  loadoutWriteSeq: 0,
}
