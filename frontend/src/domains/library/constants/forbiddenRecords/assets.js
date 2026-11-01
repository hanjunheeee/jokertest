const CHALLENGE_CLEAR_ILLUST_DIR = "/frame/library/challenge-illust"

export const FORBIDDEN_ASSETS = {
  bloodStain: "/frame/library/핏자국 리소스.png".normalize("NFD"),
}

export function getForbiddenRecordsChallengeClearIllust(pageNumber) {
  return `${CHALLENGE_CLEAR_ILLUST_DIR}/도전과제 클리어 일러스트${pageNumber}.png`.normalize(
    "NFD",
  )
}

export const FORBIDDEN_RECORDS_REWARD_ASSETS = {
  gold50: "/shopItem/ingame-money/coin/금화-50.png".normalize("NFD"),
  diamond10: "/shopItem/ingame-money/diamond/다이아-10.png".normalize("NFD"),
}