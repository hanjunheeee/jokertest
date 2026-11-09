// 초대받은 손님 그림 주소 (직업 탭 버튼·서 있는 그림·테두리·재화 아이콘)
// 직업 탭(InvitedGuestsJobTabs.jsx)·jobCatalog.js·jobChallenges.js가 씀
export const INVITED_GUESTS_ASSETS = {
  jobTabActive: "/button/버튼(수락 및 긍정).webp".normalize("NFD"),
  jobTabInactive: "/button/버튼(미선택).webp",
  nobleStanding: "/shopItem/basic/jobs-standing/귀족1.webp".normalize("NFD"),
  nobleProfileBorder:
    "/shopItem/player- profileborder/프로필프레임-귀족.webp".normalize("NFD"),
  clownStanding: "/shopItem/basic/jobs-standing/광대1.webp".normalize("NFD"),
  clownProfileBorder:
    "/shopItem/player- profileborder/프로필프레임-광대.webp".normalize("NFD"),
  doctorStanding: "/shopItem/basic/jobs-standing/주치의.webp".normalize("NFD"),
  doctorProfileBorder:
    "/shopItem/player- profileborder/프로필프레임-주치의.webp".normalize("NFD"),
  guardStanding: "/shopItem/basic/jobs-standing/경비원2.webp".normalize("NFD"),
  guardProfileBorder:
    "/shopItem/player- profileborder/프로필프레임-경비원.webp".normalize("NFD"),
  witchHunterStanding: "/shopItem/basic/jobs-standing/마녀사냥꾼.webp".normalize("NFD"),
  witchHunterProfileBorder:
    "/shopItem/player- profileborder/프로필프레임-마녀사냥꾼.webp".normalize("NFD"),
}

// 도전과제 재화 보상 아이콘
export const INVITED_GUESTS_CURRENCY_ASSETS = {
  gold50: "/shopItem/ingame-money/coin/금화-50.webp".normalize("NFD"),
  diamond10: "/shopItem/ingame-money/diamond/다이아-10.webp".normalize("NFD"),
}

// 테두리 견본 목록 (부르는 곳 없음)
const PROFILE_BORDER_BASE = "/shopItem/player- profileborder/"

export const DUMMY_PROFILE_BORDERS = [
  `${PROFILE_BORDER_BASE}프로필프레임-공작.webp`,
  `${PROFILE_BORDER_BASE}프로필프레임-후작.webp`,
  `${PROFILE_BORDER_BASE}프로필프레임-백작.webp`,
  `${PROFILE_BORDER_BASE}프로필프레임-남작.webp`,
  `${PROFILE_BORDER_BASE}프로필프레임-자작.webp`,
  `${PROFILE_BORDER_BASE}프로필프레임-황제.webp`,
].map((path) => path.normalize("NFD"))