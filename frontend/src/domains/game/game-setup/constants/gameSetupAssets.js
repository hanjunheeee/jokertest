/** 인게임 UI 설정 화면 public 에셋 (frontend/public 기준) */
export const GAME_SETUP_ASSETS = {
  bg: "/bg/게임모드 선택창 뒷배경.png",
  frame: "/frame/인게임 설정 프레임_.png",
  tabActive: "/button/인게임설정 옵션버튼(활성화).png",
  tabInactive: "/button/인게임설정 옵션버튼(비활성화).png",
  checkbox: "/button/체크박스2.png",
  checkMark: "/button/체크표시.png",
  backButton: "/button/뒤로가기 버튼2.png",
  createGameButton: "/button/버튼(수락 및 긍정).png",
}

export const GAME_SETUP_TABS = [
  { id: "general", label: "일반" },
  { id: "meeting", label: "회의&투표" },
]

/** prototype 화면 구성-일반UI — 일반 탭 항목 */
export const GENERAL_GAME_SETUP = [
  {
    id: "private-lobby",
    type: "checkbox",
    label: "비공개 로비",
    description: "새로운 플레이어는 이 게임에 참여할 수 없습니다.",
    defaultChecked: false,
  },
  {
    id: "max-players",
    type: "range",
    label: "최대 플레이어 수",
    min: 4,
    max: 10,
    defaultValue: 10,
  },
  {
    id: "joker-count",
    type: "range",
    label: "광대(마피아) 플레이어 수",
    min: 1,
    max: 4,
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

/** prototype 화면 구성-회의 & 투표UI — 회의&투표 탭 항목 (초 단위) */
export const MEETING_GAME_SETUP = [
  {
    id: "day-discussion-time",
    type: "range",
    label: "낮 토론 시간 조절",
    min: 30,
    max: 120,
    defaultValue: 60,
  },
  {
    id: "day-vote-time",
    type: "range",
    label: "낮 투표 시간 조절",
    min: 15,
    max: 90,
    defaultValue: 45,
  },
  {
    id: "night-action-time",
    type: "range",
    label: "밤 행동 시간 조절",
    min: 30,
    max: 120,
    defaultValue: 75,
  },
  {
    id: "vote-reveal",
    type: "checkbox",
    label: "투표 공개 여부",
    description: "누가 누구를 투표했는지 투표 직후에 공개됩니다.",
    defaultChecked: true,
  },
]
