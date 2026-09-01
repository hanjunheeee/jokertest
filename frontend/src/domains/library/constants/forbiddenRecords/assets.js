const CHALLENGE_CLEAR_ILLUST_DIR = "/frame/library/challenge-illust"

/** 금지된 기록 — public 에셋 경로 */
export const FORBIDDEN_RECORDS_ASSETS = {
  bloodStain: "/frame/library/핏자국 리소스.png".normalize("NFD"),
}

/** @param {number} pageNumber 1-based spread 번호 (1~7) */
export function getForbiddenRecordsChallengeClearIllust(pageNumber) {
  return `${CHALLENGE_CLEAR_ILLUST_DIR}/도전과제 클리어 일러스트${pageNumber}.png`.normalize(
    "NFD",
  )
}

/** 금지된 기록 해금 보상 — 인게임 재화 아이콘 */
export const FORBIDDEN_RECORDS_REWARD_ASSETS = {
  gold50: "/shopItem/ingame-money/coin/금화-50.png".normalize("NFD"),
  diamond10: "/shopItem/ingame-money/diamond/다이아-10.png".normalize("NFD"),
}
