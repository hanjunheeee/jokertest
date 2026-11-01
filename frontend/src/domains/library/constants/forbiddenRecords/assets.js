// 금지된 기록 그림 주소 (핏자국·클리어 일러스트·해금 보상 아이콘)
// 금지된 기록 오른쪽 쪽(RightPage)과 content/forbiddenRecords/spreadMeta.js가 씀
const CHALLENGE_CLEAR_ILLUST_DIR = "/frame/library/challenge-illust"

export const FORBIDDEN_ASSETS = {
  bloodStain: "/frame/library/핏자국 리소스.png".normalize("NFD"),
}

// 쪽 번호(1부터)로 클리어 일러스트 주소 만듦, 다른 그림처럼 NFD로 맞춤
export function getForbiddenRecordsChallengeClearIllust(pageNumber) {
  return `${CHALLENGE_CLEAR_ILLUST_DIR}/도전과제 클리어 일러스트${pageNumber}.png`.normalize(
    "NFD",
  )
}

// 해금 보상 아이콘 (금화·다이아)
export const FORBIDDEN_RECORDS_REWARD_ASSETS = {
  gold50: "/shopItem/ingame-money/coin/금화-50.png".normalize("NFD"),
  diamond10: "/shopItem/ingame-money/diamond/다이아-10.png".normalize("NFD"),
}