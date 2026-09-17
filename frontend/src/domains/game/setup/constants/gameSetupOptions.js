import { MAX_SPECIAL_ROLE_COUNT } from "./roleComposition.js"

/** GameSetupPanel 상단 탭 — 일반 / 회의&투표 */
export const GAME_SETUP_TABS = [
  { id: "general", label: "일반" },
  { id: "meeting", label: "회의&투표" },
]

/** prototype 화면 구성-일반UI — 일반 탭 항목 */
export const GENERAL_GAME_SETUP = [
  {
    id: "private-lobby",
    type: "checkbox",
    label: "코드로만 참가",
    // 이 값은 accessType("open"/"code")으로 저장돼 실제 참가 방식을 집행한다. 체크한 방도
    // 공개 목록에서 사라지지 않고 "코드" 배지(스크린리더 문구 "코드 필요")와 함께 남지만,
    // 목록의 입장 버튼이 "코드 입력"으로 바뀌어 방 코드를 입력해야 참가할 수 있다
    // (mode/utils/resolveRoomListRowCode.js · mode/components/roomList/RoomListShell.jsx).
    // "방이 목록에서 숨겨진다"는 뜻이 아니므로 문구를 그렇게 바꾸지 않는다.
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

/**
 * 직업별 밤 제한시간 스테퍼의 정의. id는 buildCreateRoomPayload가 서버 payload의 역할 키로
 * 되돌리는 유일한 근거이므로, id와 role의 대응을 여기 한 곳에서만 정한다.
 *
 * 범위·step·기본값을 전체 "밤 행동 시간"과 같게 두는 이유: 서버가 두 필드를 같은 허용 목록
 * (ALLOWED_NIGHT_ACTION_TIME)으로 검증하므로, 여기서만 범위를 넓히면 정상적인 UI 선택값이
 * 서버에서 거부된다.
 */
const ROLE_NIGHT_ACTION_TIME_RANGE = { type: "stepper", min: 30, max: 120, step: 30, defaultValue: 90, unit: "초" }

export const ROLE_NIGHT_ACTION_TIME_OPTIONS = [
  { role: "JOKER", id: "night-action-time-joker", label: "광대 밤 시간 조절" },
  { role: "DOCTOR", id: "night-action-time-doctor", label: "의사 밤 시간 조절" },
  { role: "GUARD", id: "night-action-time-guard", label: "경비원 밤 시간 조절" },
  { role: "WITCH_HUNTER", id: "night-action-time-witch-hunter", label: "마녀사냥꾼 밤 시간 조절" },
]

/** 위 정의를 SetupTabContent가 그대로 그릴 수 있는 스테퍼 항목으로 펼친 목록. */
export const ROLE_NIGHT_ACTION_TIME_ITEMS = ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ id, label }) => ({
  ...ROLE_NIGHT_ACTION_TIME_RANGE,
  id,
  label,
}))

/** prototype 화면 구성-회의 & 투표UI — 회의&투표 탭 항목 (30초 단위) */
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
  // 직업별 밤 시간은 바로 위의 전체 "밤 행동 시간" 다음에 온다 — 값을 지정하지 않은 직업이
  // 폴백하는 대상이 그 값이라, 화면에서도 그 관계가 드러나는 순서여야 한다.
  ...ROLE_NIGHT_ACTION_TIME_ITEMS,
  {
    id: "vote-reveal",
    type: "checkbox",
    label: "투표 공개 여부",
    description: "누가 누구를 투표했는지 투표 직후에 공개됩니다.",
    defaultChecked: true,
  },
]
