const PROFILE_BASE = "/shopItem/player-profile/"
const BORDER_BASE = "/shopItem/player- profileborder/"

const PROFILE_FILES = [
  "프로필-금빛가면.png",
  "프로필-기사.png",
  "프로필-사냥꾼.png",
  "프로필-귀부인.png",
  "프로필-영주.png",
  "프로필-암살자.png",
  "프로필-그림자.png",
  "프로필-악당.png",
  "프로필-역병의사.png",
  "프로필-음유시인.png",
  "프로필-영애.png",
  "프로필-붉은기운.png",
  "프로필-화관쓴소녀.png",
  "프로필-드워프.png",
  "프로필-수녀.png",
  "프로필-마인.png",
]

const BORDER_FILES = [
  "프로필프레임-황제.png",
  "프로필프레임-공작.png",
  "프로필프레임-백작.png",
  "프로필프레임-후작.png",
  "프로필프레임-남작.png",
  "프로필프레임-자작.png",
  "프로필프레임-귀족.png",
  "프로필프레임-광대.png",
  "프로필프레임-주치의.png",
  "프로필프레임-평민.png",
  "프로필프레임-경비원.png",
  "프로필프레임-마녀사냥꾼.png",
]

const NICKNAMES = [
  "고요한밤",
  "가면의기사",
  "숲의속삭임",
  "밤의후작",
  "은빛칼날",
  "침묵의칼",
  "연회의그림자",
  "가면방",
  "검은처방",
  "잔향의시",
  "달빛연회",
  "붉은안개",
  "꽃잎의속삭임",
  "깊은광산",
  "고요한기도",
  "검은탄광",
  "은빛종소리",
  "안개속칼끝",
  "별빛서약",
  "달그림자",
  "잿빛연회",
  "서리칼날",
  "황혼의속삭임",
  "검은장미",
  "은빛거울",
  "밤바람의노래",
  "침묵의무도",
  "가면아래",
  "달빛칼끝",
  "연회의끝",
]

function buildPodiumRankingEntry(rank) {
  const index = rank - 1
  return {
    rank,
    profileSrc: `${PROFILE_BASE}${PROFILE_FILES[index % PROFILE_FILES.length]}`.normalize("NFD"),
    profileBorderSrc: `${BORDER_BASE}${BORDER_FILES[index % BORDER_FILES.length]}`.normalize("NFD"),
    nickname: NICKNAMES[index],
    playCount: Math.max(42, 312 - (rank - 1) * 8),
    winRate: `${Math.max(22, 68 - (rank - 1) * 2)}%`,
  }
}

/** [DEV] API 연동 전 — 전체 순위 더미 (30위까지) */
export const PODIUM_RANKING_DUMMY = Array.from({ length: 30 }, (_, index) =>
  buildPodiumRankingEntry(index + 1),
)
