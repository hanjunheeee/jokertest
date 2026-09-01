/** [DEV] API 연동 전 — 나의 전적·숙련도 랭킹 더미 */
export const INVITED_GUESTS_DEV_STATE = {
  myStats: {
    noble: {
      playCount: 42,
      winRate: "38%",
      survivalCount: 17,
    },
  },
  ranking: {
    noble: [
      {
        rank: 1,
        profileSrc: "/shopItem/player-profile/프로필-귀부인.png".normalize("NFD"),
        profileBorderSrc: "/shopItem/player- profileborder/프로필프레임-공작.png".normalize("NFD"),
        nickname: "밤의후작",
        playCount: 128,
        winRate: "61%",
      },
      {
        rank: 2,
        profileSrc: "/shopItem/player-profile/프로필-영주.png".normalize("NFD"),
        profileBorderSrc: "/shopItem/player- profileborder/프로필프레임-후작.png".normalize("NFD"),
        nickname: "은빛칼날",
        playCount: 96,
        winRate: "54%",
      },
      {
        rank: 3,
        profileSrc: "/shopItem/player-profile/프로필-금빛가면.png".normalize("NFD"),
        profileBorderSrc: "/shopItem/player- profileborder/프로필프레임-백작.png".normalize("NFD"),
        nickname: "가면방",
        playCount: 81,
        winRate: "49%",
      },
      {
        rank: 4,
        profileSrc: "/shopItem/player-profile/프로필-기사.png".normalize("NFD"),
        profileBorderSrc: "/shopItem/player- profileborder/프로필프레임-남작.png".normalize("NFD"),
        nickname: "연회의그림자",
        playCount: 73,
        winRate: "45%",
      },
      {
        rank: 5,
        profileSrc: "/shopItem/player-profile/프로필-악당.png".normalize("NFD"),
        profileBorderSrc: "/shopItem/player- profileborder/프로필프레임-황제.png".normalize("NFD"),
        nickname: "침묵의칼",
        playCount: 65,
        winRate: "41%",
      },
    ],
  },
  /** [DEV] API 연동 전 — 클리어한 도전과제 id 목록 */
  /*
  clearedChallengeIds: {
    noble: ["noble-win-10"],
  },
  */
}
