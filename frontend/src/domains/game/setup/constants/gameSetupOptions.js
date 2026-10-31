import { MAX_SPECIAL_ROLE_COUNT } from "./roleComposition.js"

export const GAME_SETUP_TABS = [
  { id: "general", label: "일반" },
  { id: "meeting", label: "회의&투표" },
]

export const GENERAL_GAME_SETUP = [
  {
    id: "private-lobby",
    type: "checkbox",
    label: "코드로만 참가",
    description: "방 목록에 코드 필요로 표시되며, 방 코드를 입력해야 참가할 수 있습니다.",
    defaultChecked: false,
  },
  {
    id: "max-players",
    type: "stepper",
    label: "최대 플레이어 수",
    min: 4,
    max: 10,
    defaultValue: 10,
  },
  {
    id: "joker-count",
    type: "stepper",
    label: "광대(마피아) 플레이어 수",
    min: 1,
    max: MAX_SPECIAL_ROLE_COUNT,
    defaultValue: 2,
  },
  {
    id: "lights-out",
    type: "checkbox",
    label: "불이 꺼진 무도회",
    description: "광대들은 서로의 정체를 모르며, 서로를 죽일 수도 있습니다.",
    defaultChecked: false,
  },
  {
    id: "soul-betting",
    type: "checkbox",
    label: "영혼의 베팅 활성화",
    description:
      "사망자는 다음 희생자에게 [영혼석]을 베팅하여 보상을 얻을 수 있습니다.",
    defaultChecked: false,
  },
]

const ROLE_NIGHT_ACTION_TIME_RANGE = { type: "stepper", min: 30, max: 120, step: 30, defaultValue: 90, unit: "초" }

export const ROLE_NIGHT_ACTION_TIME_OPTIONS = [
  { role: "JOKER", id: "night-action-time-joker", label: "광대 밤 시간 조절" },
  { role: "DOCTOR", id: "night-action-time-doctor", label: "의사 밤 시간 조절" },
  { role: "GUARD", id: "night-action-time-guard", label: "경비원 밤 시간 조절" },
  { role: "WITCH_HUNTER", id: "night-action-time-witch-hunter", label: "마녀사냥꾼 밤 시간 조절" },
]

export const ROLE_NIGHT_ACTION_TIME_ITEMS = ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ id, label }) => ({
  ...ROLE_NIGHT_ACTION_TIME_RANGE,
  id,
  label,
}))

export const MEETING_GAME_SETUP = [
  {
    id: "day-discussion-time",
    type: "stepper",
    label: "낮 토론 시간 조절",
    min: 30,
    max: 150,
    step: 30,
    defaultValue: 60,
    unit: "초",
  },
  {
    id: "day-vote-time",
    type: "stepper",
    label: "낮 투표 시간 조절",
    min: 30,
    max: 90,
    step: 30,
    defaultValue: 60,
    unit: "초",
  },
  {
    id: "night-action-time",
    type: "stepper",
    label: "밤 행동 시간 조절",
    min: 30,
    max: 120,
    step: 30,
    defaultValue: 90,
    unit: "초",
  },
  ...ROLE_NIGHT_ACTION_TIME_ITEMS,
  {
    id: "vote-reveal",
    type: "checkbox",
    label: "투표 공개 여부",
    description: "누가 누구를 투표했는지 투표 직후에 공개됩니다.",
    defaultChecked: true,
  },
]
