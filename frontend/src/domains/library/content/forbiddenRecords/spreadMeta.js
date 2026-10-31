import { FORBIDDEN_RECORDS_REWARD_ASSETS } from "../../constants/forbiddenRecords/assets.js"

export const FORBIDDEN_RECORDS_DUMMY_UNLOCK_REWARDS = [
  { icon: FORBIDDEN_RECORDS_REWARD_ASSETS.gold50, count: 50 },
  { icon: FORBIDDEN_RECORDS_REWARD_ASSETS.diamond10, count: 50 },
]

export const FORBIDDEN_RECORDS_SPREAD_META = [
  {
    id: "record-1-masquerade",
    right: {
      locked: true,
      unlockCondition: "게임 3회 완료",
      unlockProgress: "1/3회 완료",
      progressUnit: "회 완료",
      unlockRewards: FORBIDDEN_RECORDS_DUMMY_UNLOCK_REWARDS,
    },
  },
  {
    id: "record-2-extra-mask",
    right: {
      locked: true,
      unlockCondition: "투표에 10회 참여",
      unlockProgress: "4/10회 참여",
      progressUnit: "회 참여",
      unlockRewards: FORBIDDEN_RECORDS_DUMMY_UNLOCK_REWARDS,
    },
  },
  {
    id: "record-3-first-morning",
    right: {
      locked: true,
      unlockCondition: "게임 종료 시까지 5회 생존",
      unlockProgress: "2/5회 생존",
      progressUnit: "회 생존",
      unlockRewards: FORBIDDEN_RECORDS_DUMMY_UNLOCK_REWARDS,
    },
  },
  {
    id: "record-4-testimonies",
    right: {
      locked: true,
      unlockCondition: "누적 15게임 완료",
      unlockProgress: "8/15게임 완료",
      progressUnit: "게임 완료",
      unlockRewards: FORBIDDEN_RECORDS_DUMMY_UNLOCK_REWARDS,
    },
  },
  {
    id: "record-5-clown-story",
    right: {
      locked: true,
      unlockCondition: "게임에서 10회 승리",
      unlockProgress: "3/10회 승리",
      progressUnit: "회 승리",
      unlockRewards: FORBIDDEN_RECORDS_DUMMY_UNLOCK_REWARDS,
    },
  },
  {
    id: "record-6-dead-mans-leaving",
    right: {
      locked: true,
      unlockCondition: "게임 종료 시까지 20회 생존",
      unlockProgress: "12/20회 생존",
      progressUnit: "회 생존",
      unlockRewards: FORBIDDEN_RECORDS_DUMMY_UNLOCK_REWARDS,
    },
  },
  {
    id: "record-7-erased-night",
    right: {
      locked: true,
      unlockCondition: "게임에서 30회 승리",
      unlockProgress: "7/30회 승리",
      progressUnit: "회 승리",
      unlockRewards: FORBIDDEN_RECORDS_DUMMY_UNLOCK_REWARDS,
    },
  },
]