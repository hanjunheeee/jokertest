// 스킨·카드 장착 저장 상태·직업별 장착 칸·확정 거절 코드
// 스킨·카드 장착 저장 훅(useWearConfirm)·선택 훅·저장 계산이 씀

// 저장 상태 (uncertain = 저장됐는지 확인 못 함)
export const SKIN_CARD_WEAR_CONFIRM_STATUS = Object.freeze({
  IDLE: "idle",
  SAVING: "saving",
  SUCCESS: "success",
  ERROR: "error",
  UNCERTAIN: "uncertain",
})

// 직업 탭 id → 서버 장착 칸 이름
export const JOB_ID_TO_SKIN_SLOT = Object.freeze({
  noble: "JOB_SKIN_NOBLE",
  clown: "JOB_SKIN_CLOWN",
  guard: "JOB_SKIN_GUARD",
  doctor: "JOB_SKIN_DOCTOR",
  witchHunter: "JOB_SKIN_WITCH_HUNTER",
})

// 서버가 확실히 거절한 코드: 이 밖의 오류는 저장됐는지 모르는 것으로 봄
export const CONFIRMED_EQUIP_REJECTION_CODES = new Set([
  "UNKNOWN_EQUIP_SLOT",
  "INVALID_ITEM_ID",
  "ITEM_TYPE_MISMATCH",
  "ITEM_NOT_OWNED",
  "SKIN_REVISION_CONFLICT",
])
