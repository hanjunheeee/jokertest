/** 초대받은 자들 — public 에셋 경로 */
export const INVITED_GUESTS_ASSETS = {
  jobTabActive: "/button/버튼(수락 및 긍정).png".normalize("NFD"),
  jobTabInactive: "/button/버튼(미선택).png",
  nobleStanding: "/shopItem/basic/jobs-standing/귀족1.png".normalize("NFD"),
  nobleProfileBorder:
    "/shopItem/player- profileborder/프로필프레임-귀족.png".normalize("NFD"),
  clownStanding: "/shopItem/basic/jobs-standing/광대1.png".normalize("NFD"),
  clownProfileBorder:
    "/shopItem/player- profileborder/프로필프레임-광대.png".normalize("NFD"),
  doctorStanding: "/shopItem/basic/jobs-standing/주치의.png".normalize("NFD"),
  doctorProfileBorder:
    "/shopItem/player- profileborder/프로필프레임-주치의.png".normalize("NFD"),
  guardStanding: "/shopItem/basic/jobs-standing/경비원2.png".normalize("NFD"),
  guardProfileBorder:
    "/shopItem/player- profileborder/프로필프레임-경비원.png".normalize("NFD"),
  witchHunterStanding: "/shopItem/basic/jobs-standing/마녀사냥꾼.png".normalize("NFD"),
  witchHunterProfileBorder:
    "/shopItem/player- profileborder/프로필프레임-마녀사냥꾼.png".normalize("NFD"),
}

/** 도전과제 보상 — 인게임 재화 아이콘 */
export const INVITED_GUESTS_CURRENCY_ASSETS = {
  gold50: "/shopItem/ingame-money/coin/금화-50.png".normalize("NFD"),
  diamond10: "/shopItem/ingame-money/diamond/다이아-10.png".normalize("NFD"),
}

const PROFILE_BORDER_BASE = "/shopItem/player- profileborder/"

/** [DEV] 랭킹 더미 — 프로필 테두리 풀 */
export const INVITED_GUESTS_DUMMY_PROFILE_BORDERS = [
  `${PROFILE_BORDER_BASE}프로필프레임-공작.png`,
  `${PROFILE_BORDER_BASE}프로필프레임-후작.png`,
  `${PROFILE_BORDER_BASE}프로필프레임-백작.png`,
  `${PROFILE_BORDER_BASE}프로필프레임-남작.png`,
  `${PROFILE_BORDER_BASE}프로필프레임-자작.png`,
  `${PROFILE_BORDER_BASE}프로필프레임-황제.png`,
].map((path) => path.normalize("NFD"))
