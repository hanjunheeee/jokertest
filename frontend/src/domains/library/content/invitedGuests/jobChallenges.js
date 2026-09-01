import {
  INVITED_GUESTS_ASSETS,
  INVITED_GUESTS_CURRENCY_ASSETS,
} from "@/domains/library/constants/invitedGuests/assets.js"

/** 직업별 도전과제 (난이도 오름차순) */
export const INVITED_GUESTS_JOB_CHALLENGES = {
  noble: [
    {
      id: "noble-win-10",
      label: "귀족으로 10회 승리",
      difficulty: 1,
      rewards: [
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.gold50, count: 10 },
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.diamond10, count: 10 },
      ],
    },
    {
      id: "noble-win-20",
      label: "귀족으로 20회 승리",
      difficulty: 2,
      rewards: [
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.gold50, count: 20 },
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.diamond10, count: 30 },
      ],
    },
    {
      id: "noble-win-30",
      label: "귀족으로 30회 승리",
      difficulty: 3,
      rewards: [
        {
          type: "border",
          icon: INVITED_GUESTS_ASSETS.nobleProfileBorder,
          label: "귀족 프로필 테두리",
        },
      ],
    },
  ],
  clown: [
    {
      id: "clown-win-10",
      label: "광대로 10회 승리",
      difficulty: 1,
      rewards: [
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.gold50, count: 10 },
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.diamond10, count: 10 },
      ],
    },
    {
      id: "clown-win-20",
      label: "광대로 20회 승리",
      difficulty: 2,
      rewards: [
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.gold50, count: 20 },
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.diamond10, count: 30 },
      ],
    },
    {
      id: "clown-win-30",
      label: "광대로 30회 승리",
      difficulty: 3,
      rewards: [
        {
          type: "border",
          icon: INVITED_GUESTS_ASSETS.clownProfileBorder,
          label: "광대 프로필 테두리",
        },
      ],
    },
  ],
  doctor: [
    {
      id: "doctor-win-10",
      label: "주치의로 10회 승리",
      difficulty: 1,
      rewards: [
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.gold50, count: 10 },
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.diamond10, count: 10 },
      ],
    },
    {
      id: "doctor-win-20",
      label: "주치의로 20회 승리",
      difficulty: 2,
      rewards: [
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.gold50, count: 20 },
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.diamond10, count: 30 },
      ],
    },
    {
      id: "doctor-win-30",
      label: "주치의로 30회 승리",
      difficulty: 3,
      rewards: [
        {
          type: "border",
          icon: INVITED_GUESTS_ASSETS.doctorProfileBorder,
          label: "주치의 프로필 테두리",
        },
      ],
    },
  ],
  guard: [
    {
      id: "guard-win-10",
      label: "경비원으로 10회 승리",
      difficulty: 1,
      rewards: [
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.gold50, count: 10 },
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.diamond10, count: 10 },
      ],
    },
    {
      id: "guard-win-20",
      label: "경비원으로 20회 승리",
      difficulty: 2,
      rewards: [
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.gold50, count: 20 },
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.diamond10, count: 30 },
      ],
    },
    {
      id: "guard-win-30",
      label: "경비원으로 30회 승리",
      difficulty: 3,
      rewards: [
        {
          type: "border",
          icon: INVITED_GUESTS_ASSETS.guardProfileBorder,
          label: "경비원 프로필 테두리",
        },
      ],
    },
  ],
  witchHunter: [
    {
      id: "witch-hunter-win-10",
      label: "마녀사냥꾼으로 10회 승리",
      difficulty: 1,
      rewards: [
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.gold50, count: 10 },
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.diamond10, count: 10 },
      ],
    },
    {
      id: "witch-hunter-win-20",
      label: "마녀사냥꾼으로 20회 승리",
      difficulty: 2,
      rewards: [
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.gold50, count: 20 },
        { type: "currency", icon: INVITED_GUESTS_CURRENCY_ASSETS.diamond10, count: 30 },
      ],
    },
    {
      id: "witch-hunter-win-30",
      label: "마녀사냥꾼으로 30회 승리",
      difficulty: 3,
      rewards: [
        {
          type: "border",
          icon: INVITED_GUESTS_ASSETS.witchHunterProfileBorder,
          label: "마녀사냥꾼 프로필 테두리",
        },
      ],
    },
  ],
}
