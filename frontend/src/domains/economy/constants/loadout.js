// 장착 칸 상수 (직업 스킨 칸 → 직업 id, 프로필·카드 칸 → 장착 상태 필드, 충돌 때 다시 보내는 횟수)
// 경제 스토어의 장착 액션·장착 저장이 씀

export const JOB_SKIN_SLOT_TO_JOB_ID = Object.freeze({
  JOB_SKIN_NOBLE: "noble",
  JOB_SKIN_CLOWN: "clown",
  JOB_SKIN_GUARD: "guard",
  JOB_SKIN_DOCTOR: "doctor",
  JOB_SKIN_WITCH_HUNTER: "witchHunter",
})

export const SLOT_TO_LOADOUT_FIELD = Object.freeze({
  PROFILE_PHOTO: "selectedProfilePhotoId",
  PROFILE_BORDER: "selectedProfileBorderId",
  PLAYER_CARD_FRAME: "selectedCardFrameId",
})

export const MAX_LOADOUT_EQUIP_AUTO_RETRIES = 2
