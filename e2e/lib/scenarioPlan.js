/**
 * 10일차 E2E 시나리오의 결정적 계획 — 방 설정 조작, 밤/낮 행동, 기대 문구.
 *
 * 전부 순수 함수라 playwright 없이 node:test로 돌아간다. 기대 문구는 절대 복사하지 않고
 * 프런트엔드의 프로덕션 빌더를 그대로 import해 만든다 — 화면 문구가 바뀌면 이 파일이 만드는
 * 기대값도 같이 바뀌므로 "테스트만 통과하고 화면은 다른" 드리프트가 구조적으로 불가능하다.
 * import 대상은 React/소켓 의존이 전혀 없는 순수 모듈로만 한정한다.
 *
 * 좌석(seat)은 방 입장 순서다 — backend의 DEBUG_FIXED_ROLES가 입장 순서 그대로 역할을
 * 배정하므로(resolveDebugFixedRoleAssignment), 좌석 index가 곧 역할이다.
 */
import {
  getInGameNightActionLabel,
  getInGameNightActionType,
} from "../../frontend/src/domains/game/ingame/constants/actions/ingameActionPanel.js"
import { buildInGameKillRevealMessage } from "../../frontend/src/domains/game/ingame/constants/killReveal/ingameKillReveal.js"
import { getInGameRoleRevealDisplay } from "../../frontend/src/domains/game/ingame/constants/roleReveal/ingameRoleRevealData.js"
import { reduceInGameNightPrivateResult } from "../../frontend/src/domains/game/ingame/utils/reduceInGameNightPrivateResult.js"
import { GENERAL_GAME_SETUP } from "../../frontend/src/domains/game/setup/constants/gameSetupOptions.js"
import {
  CUSTOM_ROLE_KEYS,
  CUSTOM_ROLE_LABELS,
  DEFAULT_CUSTOM_ROLE_COUNTS,
  MAX_CUSTOM_JOKER_COUNT,
  MIN_CUSTOM_JOKER_COUNT,
  ROLE_COMPOSITION_MODES,
  ROLE_COMPOSITION_MODE_OPTIONS,
} from "../../frontend/src/domains/game/setup/constants/roleComposition.js"
import { getRoleCountRange } from "../../frontend/src/domains/game/setup/utils/roleComposition.js"

/** 좌석 index → 역할. backend의 DEBUG_FIXED_ROLES 값과 순서가 정확히 같아야 한다. */
export const SEAT_ROLES = Object.freeze(["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER", "CITIZEN"])

/** backend/.env에 넣어야 하는 DEBUG_FIXED_ROLES 값 그대로. */
export const DEBUG_FIXED_ROLES_VALUE = SEAT_ROLES.join(",")

/** 좌석 수 = 방 정원. */
export const SEAT_COUNT = SEAT_ROLES.length

/** 역할별 좌석 index — 시나리오 본문이 숫자를 직접 쓰지 않게 한다. */
export const SEAT = Object.freeze({
  JOKER: 0,
  DOCTOR: 1,
  GUARD: 2,
  WITCH_HUNTER: 3,
  CITIZEN: 4,
})

/**
 * 보호가 성공해 아무도 죽지 않는 "평범한 밤"의 개수. 1일차 밤부터 9일차 밤까지다.
 * 게임의 첫 진행 단계는 밤이 아니라 DAY dayIndex 1이므로(backend enterDayPhase), NIGHT n은
 * DAY n 다음에 온다.
 */
export const NORMAL_NIGHT_COUNT = 9

/** 보호가 빗나가 CITIZEN이 죽는 밤의 dayIndex. */
export const LETHAL_NIGHT_DAY_INDEX = 10

/** 사망 이후 처형 재판이 열리는 낮의 dayIndex(NIGHT 10 → DAY 11). */
export const FINAL_DAY_INDEX = 11

/** 시나리오가 통과하는 첫 낮 — 요구서에는 없지만 첫 밤에 닿으려면 반드시 지나야 한다. */
export const FIRST_DAY_INDEX = 1

/** GUARD가 매일 다른 대상을 조사하도록 순환하는 풀(자기 자신 제외). */
const GUARD_INVESTIGATION_POOL = Object.freeze([
  SEAT.JOKER,
  SEAT.DOCTOR,
  SEAT.WITCH_HUNTER,
  SEAT.CITIZEN,
])

/** WITCH_HUNTER 확인 풀(자기 자신 제외). GUARD와 시작점을 어긋나게 잡아 같은 밤에 겹치지 않는다. */
const WITCH_HUNTER_CONFIRM_POOL = Object.freeze([
  SEAT.JOKER,
  SEAT.DOCTOR,
  SEAT.GUARD,
  SEAT.CITIZEN,
])

/**
 * 좌석 역할의 진영. backend ROLE_DEFINITIONS.team과 같은 규칙이다(JOKER만 광대 진영).
 * @param {string} role 역할 이름
 */
export function seatTeam(role) {
  return role === "JOKER" ? "JOKER" : "CITIZEN"
}

/**
 * 좌석 index의 역할을 돌려준다.
 * @param {number} seatIndex 0-based 좌석 index
 */
export function seatRole(seatIndex) {
  return SEAT_ROLES[seatIndex] ?? null
}

/**
 * 그 밤에 마녀사냥꾼이 행동할 수 있는가. 판정은 프런트 프로덕션 규칙에 그대로 위임한다.
 * @param {number} dayIndex 그 밤의 canonical dayIndex
 */
export function witchHunterCanActOn(dayIndex) {
  return getInGameNightActionType("WITCH_HUNTER", dayIndex) !== null
}

/**
 * min부터 max까지 1 간격 정수 배열 — SetupStepperRow.buildOptions와 같은 규칙.
 * @param {number} min 하한
 * @param {number} max 상한
 * @flow max < min이면 빈 배열이 되어 아래 인덱스 계산이 -1로 걸린다(조용히 0클릭이 되지 않는다).
 */
function buildStepperOptions(min, max) {
  const options = []
  for (let current = min; current <= max; current += 1) options.push(current)
  return options
}

/**
 * 스테퍼 하나를 현재값에서 목표값까지 옮기는 조작 한 건을 만든다.
 * @param {string} label 스테퍼의 aria-label 접두(= 행 제목)
 * @param {Array} options 스테퍼가 순환하는 선택지 배열(표시값이 아니라 원값)
 * @param {*} currentValue 화면에 지금 떠 있는 값
 * @param {*} targetValue 시나리오가 원하는 값
 * @flow 두 값이 목록에 없으면 즉시 throw한다 — 헛클릭으로 조용히 다른 방을 만드는 것보다
 *   여기서 멈추는 편이 낫다. 이미 목표값이면 null(조작 불필요)을 돌려준다.
 * @returns {{kind:"stepper", label:string, direction:"increase"|"decrease", clicks:number}|null}
 */
function buildStepperStep(label, options, currentValue, targetValue) {
  const from = options.indexOf(currentValue)
  const to = options.indexOf(targetValue)
  if (from < 0 || to < 0) {
    throw new Error(
      `"${label}" 스테퍼 계획을 세울 수 없습니다 — 현재값(${currentValue}) 또는 목표값(${targetValue})이 선택지에 없습니다: ${options.join(",")}`,
    )
  }
  if (from === to) return null
  return {
    kind: "stepper",
    label,
    direction: to > from ? "increase" : "decrease",
    clicks: Math.abs(to - from),
  }
}

/**
 * 방 생성 화면의 기본값에서 5인 공개(open) CUSTOM(광대1·의사1·경비대1·마녀사냥꾼1)까지의
 * 조작 목록을 만든다.
 *
 * CUSTOM이 반드시 필요한 이유: 5인 AUTO 방의 특수 역할 budget은 전부 0이라
 * (backend getSpecialRoleBudget) 구성이 JOKER 1 + CITIZEN 4가 되고, DEBUG_FIXED_ROLES는
 * COMPOSITION_MISMATCH로 조용히 무시된 뒤 랜덤 배정으로 되돌아간다.
 *
 * 공개(open)가 반드시 필요한 이유: 나머지 좌석이 공개 방 목록에서 클릭으로 입장하는데,
 * accessType이 "code"면 그 경로가 프런트·서버 양쪽에서 막힌다.
 *
 * @flow 순서가 중요하다. ① 정원을 먼저 5로 줄여야 역할 스테퍼의 범위가 5 기준으로 잡히고,
 *   ② 역할 구성을 CUSTOM으로 바꾸는 순간 useRoleCompositionState가 AUTO의 광대 수를 승계하므로
 *   ③ 광대 수 보정은 그 다음에 와야 한다. 나머지 고정 역할은 0에서 1로 올린다.
 *   "코드로만 참가"는 기본값이 꺼짐일 때 아무 조작도 만들지 않고, 기본값이 뒤집혔을 때만
 *   끄는 조작이 들어간다.
 * @returns {Array<object>} actors가 그대로 재생하는 조작 목록
 */
function buildRoomSetupPlan() {
  const maxPlayersItem = GENERAL_GAME_SETUP.find((item) => item.id === "max-players")
  const autoJokerItem = GENERAL_GAME_SETUP.find((item) => item.id === "joker-count")
  const privateLobbyItem = GENERAL_GAME_SETUP.find((item) => item.id === "private-lobby")

  const steps = []

  // ① 정원 10 → 5
  const maxPlayersStep = buildStepperStep(
    maxPlayersItem.label,
    buildStepperOptions(maxPlayersItem.min, maxPlayersItem.max),
    maxPlayersItem.defaultValue,
    SEAT_COUNT,
  )
  if (maxPlayersStep) steps.push(maxPlayersStep)

  // ② 코드로만 참가는 반드시 꺼져 있어야 한다 — 켜면 accessType이 "code"가 되어
  //    (buildCreateRoomPayload) 공개 목록의 입장 버튼이 잠기고(RoomListShell) 서버도
  //    join_public_room을 거부한다(backend/socket/matchmaking.js의 handleJoinPublicRoom).
  //    기본값이 이미 꺼짐이라 지금은 조작이 생기지 않지만, 기본값이 뒤집히면 끄는 조작이 들어간다.
  if (privateLobbyItem.defaultChecked === true) {
    steps.push({ kind: "checkbox", label: privateLobbyItem.label })
  }

  // ③ 역할 구성 자동 → 직접 지정
  const modeStep = buildStepperStep(
    "역할 구성",
    ROLE_COMPOSITION_MODE_OPTIONS.map((option) => option.mode),
    ROLE_COMPOSITION_MODES.AUTO,
    ROLE_COMPOSITION_MODES.CUSTOM,
  )
  if (modeStep) steps.push(modeStep)

  // ④·⑤ 역할별 인원. JOKER의 "현재값"은 CUSTOM 전환 시 승계된 AUTO 광대 수다.
  const inheritsAutoJoker =
    Number.isInteger(autoJokerItem.defaultValue) &&
    autoJokerItem.defaultValue >= MIN_CUSTOM_JOKER_COUNT &&
    autoJokerItem.defaultValue <= MAX_CUSTOM_JOKER_COUNT
  for (const roleKey of CUSTOM_ROLE_KEYS) {
    const range = getRoleCountRange(roleKey, SEAT_COUNT)
    const currentValue =
      roleKey === "JOKER" && inheritsAutoJoker
        ? autoJokerItem.defaultValue
        : DEFAULT_CUSTOM_ROLE_COUNTS[roleKey]
    const step = buildStepperStep(
      `${CUSTOM_ROLE_LABELS[roleKey]} 인원`,
      buildStepperOptions(range.min, range.max),
      currentValue,
      1,
    )
    if (step) steps.push(step)
  }

  return Object.freeze(steps.map((step) => Object.freeze(step)))
}

/** 방 생성 화면에서 순서대로 재생해야 하는 조작 목록. */
export const ROOM_SETUP_PLAN = buildRoomSetupPlan()

/**
 * 밤 n의 GUARD 조사 대상 좌석. 4밤 주기로 순환한다.
 * @param {number} dayIndex 그 밤의 canonical dayIndex(1부터)
 */
function guardTargetSeat(dayIndex) {
  return GUARD_INVESTIGATION_POOL[(dayIndex - 1) % GUARD_INVESTIGATION_POOL.length]
}

/**
 * 밤 n의 WITCH_HUNTER 확인 대상 좌석. GUARD와 한 칸 어긋나게 돌아 같은 밤에 겹치지 않는다.
 * @param {number} dayIndex 그 밤의 canonical dayIndex(1부터)
 */
function witchHunterTargetSeat(dayIndex) {
  return WITCH_HUNTER_CONFIRM_POOL[dayIndex % WITCH_HUNTER_CONFIRM_POOL.length]
}

/**
 * 좌석 하나의 밤 행동 계획 한 건. 버튼 문구(actionLabel)는 dayIndex를 아는 planNight이 채운다.
 * @param {number} seatIndex 좌석 index
 * @param {"SUBMIT"|"SKIP"|"NONE"} action 대상 지정 제출 / 건너뛰기 / 애초에 행동 불가
 * @param {number|null} targetSeat 대상 좌석 index
 */
function nightSeatPlan(seatIndex, action, targetSeat) {
  return { seatIndex, role: SEAT_ROLES[seatIndex], action, targetSeat }
}

/**
 * 밤 하나의 전체 계획을 만든다.
 * @param {number} dayIndex 그 밤의 canonical dayIndex(1부터)
 * @flow 마지막 밤(LETHAL_NIGHT_DAY_INDEX)은 DOCTOR가 GUARD를 보호해 JOKER의 암살이 성공하고,
 *   GUARD·WITCH_HUNTER는 건너뛴다(개인 결과 오버레이가 사망 연출과 경쟁하지 않게). 그 앞의
 *   밤들은 DOCTOR가 JOKER와 같은 대상을 보호해 아무도 죽지 않는다. WITCH_HUNTER는 그 밤에
 *   행동 가능한지를 하드코딩하지 않고 witchHunterCanActOn으로 매번 판정한다.
 * @returns {{dayIndex:number, lethal:boolean, expectedDeathSeat:number|null, seats:Array<object>}}
 */
export function planNight(dayIndex) {
  if (!Number.isInteger(dayIndex) || dayIndex < 1) {
    throw new Error(`밤 계획을 세울 수 없는 dayIndex입니다: ${dayIndex}`)
  }
  const lethal = dayIndex === LETHAL_NIGHT_DAY_INDEX

  const seats = SEAT_ROLES.map((role, seatIndex) => {
    if (role === "JOKER") return nightSeatPlan(seatIndex, "SUBMIT", SEAT.CITIZEN)
    if (role === "DOCTOR") {
      // 마지막 밤에만 빗나간 보호(GUARD를 지킨다) — 그래서 CITIZEN이 죽는다.
      return nightSeatPlan(seatIndex, "SUBMIT", lethal ? SEAT.GUARD : SEAT.CITIZEN)
    }
    if (role === "GUARD") {
      if (lethal) return nightSeatPlan(seatIndex, "SKIP", null)
      return nightSeatPlan(seatIndex, "SUBMIT", guardTargetSeat(dayIndex))
    }
    if (role === "WITCH_HUNTER") {
      if (!witchHunterCanActOn(dayIndex)) return nightSeatPlan(seatIndex, "NONE", null)
      if (lethal) return nightSeatPlan(seatIndex, "SKIP", null)
      return nightSeatPlan(seatIndex, "SUBMIT", witchHunterTargetSeat(dayIndex))
    }
    return nightSeatPlan(seatIndex, "NONE", null)
  }).map((plan) => ({
    ...plan,
    actionLabel: plan.action === "NONE" ? null : getInGameNightActionLabel(plan.role, dayIndex),
  }))

  return {
    dayIndex,
    lethal,
    expectedDeathSeat: lethal ? SEAT.CITIZEN : null,
    seats,
  }
}

/**
 * 낮 하나의 투표 계획을 만든다.
 * @param {number} dayIndex 그 낮의 canonical dayIndex
 * @flow 마지막 낮(FINAL_DAY_INDEX)에는 생존한 비-JOKER 전원이 JOKER를 지목하고 JOKER 본인은
 *   기권한다 — 서버가 자기 자신 투표를 SELF_TARGET_NOT_ALLOWED로 거부하고 UI 목록에도
 *   자기 자신이 없기 때문이다. 그 앞의 낮은 전원 기권으로 통과해 다음 밤으로 넘어간다.
 *   NIGHT 10에서 죽은 CITIZEN은 마지막 낮에 투표자가 아니다(alive:false).
 *   expectedNextPhase는 집계 결과가 실제로 옮겨가는 canonical phase다 — 화면의 결과 문구는
 *   DAY 섹션 안에만 있어 전이와 동시에 사라지므로, 검증은 이 phase로 한다.
 * @returns {{dayIndex:number, expectedOutcome:string, expectedNextPhase:string,
 *   expectedTribunalSeat:number|null, seats:Array<object>}}
 */
export function planDay(dayIndex) {
  if (!Number.isInteger(dayIndex) || dayIndex < 1) {
    throw new Error(`낮 계획을 세울 수 없는 dayIndex입니다: ${dayIndex}`)
  }
  const isFinalDay = dayIndex === FINAL_DAY_INDEX
  const deadSeats = isFinalDay ? [SEAT.CITIZEN] : []

  const seats = SEAT_ROLES.map((role, seatIndex) => {
    const alive = !deadSeats.includes(seatIndex)
    if (!alive) return { seatIndex, role, alive: false, vote: null }
    if (!isFinalDay) return { seatIndex, role, alive: true, vote: "ABSTAIN" }
    // 자기 자신은 지목할 수 없으므로 JOKER는 기권한다.
    return {
      seatIndex,
      role,
      alive: true,
      vote: seatIndex === SEAT.JOKER ? "ABSTAIN" : SEAT.JOKER,
    }
  })

  return {
    dayIndex,
    expectedOutcome: isFinalDay ? "TRIBUNAL" : "ABSTAINED",
    expectedNextPhase: isFinalDay ? "TRIBUNAL" : "NIGHT",
    expectedTribunalSeat: isFinalDay ? SEAT.JOKER : null,
    seats,
  }
}

/**
 * GUARD 조사 결과로 화면에 나가야 하는 문구를 프로덕션 빌더로 만든다.
 * @param {string} targetNickname 조사 대상의 닉네임
 * @param {string} targetRole 조사 대상의 실제 역할(진영은 여기서 파생한다)
 * @flow reduceInGameNightPrivateResult에 실제 payload와 같은 형태를 넣어, 화면이 그리는 바로
 *   그 문자열을 되받는다. 빌더가 null을 주면(형태 불일치) 즉시 throw한다.
 */
export function expectedInvestigateLabel(targetNickname, targetRole) {
  const targetId = "seat-target"
  const result = reduceInGameNightPrivateResult(
    { actionType: "INVESTIGATE", targetId, team: seatTeam(targetRole) },
    [{ uuid: targetId, nickname: targetNickname }],
  )
  if (result === null) {
    throw new Error(`조사 결과 문구를 만들 수 없습니다: ${targetNickname}/${targetRole}`)
  }
  return result.label
}

/**
 * WITCH_HUNTER 확인 결과로 화면에 나가야 하는 문구를 프로덕션 빌더로 만든다.
 * @param {string} targetNickname 확인 대상의 닉네임
 * @param {string} targetRole 확인 대상의 실제 역할
 * @flow 조사 문구와 같은 이유로 프로덕션 빌더에 위임한다.
 */
export function expectedConfirmLabel(targetNickname, targetRole) {
  const targetId = "seat-target"
  const result = reduceInGameNightPrivateResult(
    { actionType: "CONFIRM", targetId, role: targetRole },
    [{ uuid: targetId, nickname: targetNickname }],
  )
  if (result === null) {
    throw new Error(`확인 결과 문구를 만들 수 없습니다: ${targetNickname}/${targetRole}`)
  }
  return result.label
}

/**
 * 사망 연출에 나가야 하는 문구를 프로덕션 빌더로 만든다(출처는 항상 JOKER).
 * @param {string} victimNickname 희생자 닉네임
 */
export function expectedKillRevealMessage(victimNickname) {
  return buildInGameKillRevealMessage("JOKER", victimNickname)
}

/**
 * 역할 공개 오버레이에 나가야 하는 역할명·진영 라벨을 돌려준다.
 * @param {string} role 좌석의 역할
 * @flow 알 수 없는 역할이면 즉시 throw한다 — 좌석 표가 어긋난 채로 시나리오를 이어가면
 *   훨씬 뒤에서 엉뚱한 이유로 실패한다.
 */
export function expectedRoleRevealTexts(role) {
  const display = getInGameRoleRevealDisplay(role)
  if (display === null) throw new Error(`알 수 없는 역할입니다: ${role}`)
  return { name: display.name, teamLabel: display.teamLabel }
}
