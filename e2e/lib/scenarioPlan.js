/**
 * 10일차 E2E 시나리오의 결정적 계획 — 방 설정 조작, 밤/낮 행동, 기대 문구.
 *
 * 타임라인은 "치명 밤 1 + 평범한 밤 2~9 + 최종 낮 10"이다. 마녀사냥꾼이 시신이 있는 밤에만
 * 턴을 받게 바뀌었으므로(backend isEligibleForNightAction), 시신을 시나리오 맨 앞에서 만들어야
 * 그 뒤 여덟 밤 내내 확인 행동을 검증할 수 있다.
 *
 * 전부 순수 함수라 playwright 없이 node:test로 돌아간다. 기대 문구는 절대 복사하지 않고
 * 프런트엔드의 프로덕션 빌더를 그대로 import해 만든다 — 화면 문구가 바뀌면 이 파일이 만드는
 * 기대값도 같이 바뀌므로 "테스트만 통과하고 화면은 다른" 드리프트가 구조적으로 불가능하다.
 * import 대상은 React/소켓 의존이 전혀 없는 순수 모듈로만 한정한다.
 *
 * 좌석(seat)은 방 입장 순서다 — backend의 DEBUG_FIXED_ROLES가 입장 순서 그대로 역할을
 * 배정하므로(resolveDebugFixedRoleAssignment), 좌석 index가 곧 역할이다.
 */
import { getInGameNightActionLabel } from "../../frontend/src/domains/game/ingame/constants/actions/ingameActionPanel.js"
import { buildInGameKillRevealMessage } from "../../frontend/src/domains/game/ingame/constants/killReveal/ingameKillReveal.js"
import { getInGameNightTurnAnnouncement } from "../../frontend/src/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js"
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

/** 보호가 빗나가 CITIZEN이 죽는 밤의 dayIndex — 이제 시나리오의 첫 밤이다. */
export const LETHAL_NIGHT_DAY_INDEX = 1

/** 처형 재판이 열리는 마지막 낮의 dayIndex(NIGHT 9 → DAY 10). */
export const FINAL_DAY_INDEX = 10

/** 시나리오가 통과하는 첫 낮 — 요구서에는 없지만 첫 밤에 닿으려면 반드시 지나야 한다. */
export const FIRST_DAY_INDEX = 1

/** 치명 밤에 죽어 그 뒤 여덟 밤 동안 마녀사냥꾼의 조사 대상이 되는 시신의 좌석. */
export const VICTIM_SEAT = SEAT.CITIZEN

/** 평범한 밤마다 JOKER가 노리고 DOCTOR가 같은 대상을 지켜 보호가 성공하는 좌석. */
export const ASSASSINATION_TARGET_SEAT = SEAT.GUARD

/**
 * 보호가 성공해 아무도 죽지 않는 "평범한 밤"의 dayIndex 목록.
 *
 * 배열로 노출하는 이유: 새 타임라인은 "1부터 N까지"가 아니라 "치명 밤 1 + 평범한 밤 2~9"라
 * for(1..N) 루프로 표현할 수 없다. 치명 밤 다음 밤부터 마지막 낮 직전 밤까지를 그대로 편다 —
 * 게임의 첫 진행 단계는 밤이 아니라 DAY dayIndex 1이므로(backend enterDayPhase), NIGHT n은
 * DAY n 다음에 오고 그 결과는 DAY n+1에서 보인다.
 */
export const NORMAL_NIGHT_DAY_INDEXES = Object.freeze(
  Array.from(
    { length: FINAL_DAY_INDEX - LETHAL_NIGHT_DAY_INDEX - 1 },
    (_, offset) => LETHAL_NIGHT_DAY_INDEX + 1 + offset,
  ),
)

/** 평범한 밤의 개수. */
export const NORMAL_NIGHT_COUNT = NORMAL_NIGHT_DAY_INDEXES.length

/**
 * GUARD가 매일 다른 대상을 조사하도록 순환하는 풀.
 *
 * 자기 자신과 VICTIM_SEAT를 뺀 나머지 셋이다 — 치명 밤 이후 시신 카드는 GUARD 목록에서
 * selectable:false로 잠기므로(buildNightActionTargets의 deadTargetsOnly 반대 분기) 클릭 자체가
 * 불가능하고, 남은 셋은 마지막 낮까지 전원 생존한다.
 */
const GUARD_INVESTIGATION_POOL = Object.freeze([SEAT.JOKER, SEAT.DOCTOR, SEAT.WITCH_HUNTER])

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
 * 그 밤이 시작될 때 이미 시신인 좌석 목록.
 * @param {number} dayIndex 그 밤의 canonical dayIndex
 * @flow 사망은 밤의 판정(backend commitNightResolution)에서 확정되므로 치명 밤 당일에는 아직
 *   시신이 없다 — backend hasAnyDeadPlayer가 말하는 "그 밤 시작 시점의 사망자 유무"와 정확히
 *   같은 의미다. 그래서 치명 밤 dayIndex 자체는 포함하지 않는다.
 */
export function deadSeatsAtNight(dayIndex) {
  return dayIndex > LETHAL_NIGHT_DAY_INDEX ? [VICTIM_SEAT] : []
}

/**
 * 그 낮에 이미 시신인 좌석 목록.
 * @param {number} dayIndex 그 낮의 canonical dayIndex
 * @flow 치명 밤 1의 결과는 DAY 2 진입과 함께 보인다 — 낮의 경계도 밤과 같은 부등호로 갈린다.
 */
export function deadSeatsAtDay(dayIndex) {
  return dayIndex > LETHAL_NIGHT_DAY_INDEX ? [VICTIM_SEAT] : []
}

/**
 * 그 낮의 생존 좌석 index 목록 — 기권·투표 인원 계산의 단일 출처다.
 * @param {number} dayIndex 그 낮의 canonical dayIndex
 */
export function aliveSeatsAtDay(dayIndex) {
  const dead = deadSeatsAtDay(dayIndex)
  return SEAT_ROLES.map((_, seatIndex) => seatIndex).filter((seatIndex) => !dead.includes(seatIndex))
}

/**
 * 그 밤에 마녀사냥꾼이 행동할 수 있는가 — 판정 근거는 오직 "그 밤에 시신이 있는가"다.
 * @param {number} dayIndex 그 밤의 canonical dayIndex
 * @flow 예전에는 프런트의 getInGameNightActionType에 위임했지만, 프런트는 더 이상 시신 유무를
 *   판단하지 않는다(WITCH_HUNTER의 밤 행동 하한이 0으로 내려가 언제나 "CONFIRM"이다). 유일한
 *   권위자는 backend isEligibleForNightAction이고 그 조건은 hasAnyDeadPlayer 하나다 — e2e는 자기
 *   시나리오가 언제 시신을 만드는지 알고 있으므로 그 사실로 기대값을 만든다. 정수가 아니거나
 *   음수인 dayIndex는 조용히 true가 되지 않도록 먼저 걸러낸다.
 */
export function witchHunterCanActOn(dayIndex) {
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return false
  return deadSeatsAtNight(dayIndex).length > 0
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
 * 밤 n의 GUARD 조사 대상 좌석. 풀 크기(3)만큼의 주기로 순환한다.
 * @param {number} dayIndex 그 밤의 canonical dayIndex(1부터)
 */
function guardTargetSeat(dayIndex) {
  return GUARD_INVESTIGATION_POOL[(dayIndex - 1) % GUARD_INVESTIGATION_POOL.length]
}

/**
 * 좌석 하나의 밤 행동 계획 한 건. 버튼 문구(actionLabel)는 dayIndex를 아는 planNight이 채운다.
 * @param {number} seatIndex 좌석 index
 * @param {"SUBMIT"|"SKIP"|"NONE"} action 대상 지정 제출 / 건너뛰기 / 애초에 행동 불가
 * @param {number|null} targetSeat 대상 좌석 index
 * @param {boolean} turnExpected 그 밤에 canonical 역할 턴이 이 좌석에게 오는가
 * @flow turnExpected는 action만으로는 구분할 수 없는 두 상황을 갈라준다 — "역할에 애초에 밤
 *   행동이 없다"(CITIZEN)와 "이 밤에는 턴 자체가 오지 않는다"(시신 없는 밤의 WITCH_HUNTER)는
 *   둘 다 action:"NONE"이지만, 후자만 "턴 안내가 뜨지 않는지"를 검증할 대상이다.
 */
function nightSeatPlan(seatIndex, action, targetSeat, turnExpected) {
  return { seatIndex, role: SEAT_ROLES[seatIndex], action, targetSeat, turnExpected }
}

/**
 * 밤 하나의 전체 계획을 만든다.
 * @param {number} dayIndex 그 밤의 canonical dayIndex(1부터)
 * @flow 치명 밤(LETHAL_NIGHT_DAY_INDEX = 첫 밤)은 JOKER가 VICTIM_SEAT을 노리는데 DOCTOR가
 *   엉뚱한 좌석(ASSASSINATION_TARGET_SEAT)을 지켜 암살이 성공한다. 그 뒤의 평범한 밤은 둘 다
 *   ASSASSINATION_TARGET_SEAT을 지목해 보호가 성공하고 아무도 죽지 않는다. GUARD는 모든 밤에
 *   정상 조사하고, WITCH_HUNTER는 그 밤에 시신이 있을 때만(witchHunterCanActOn) 그 시신을
 *   확인한다 — 매 밤 같은 시신을 다시 지목하는 것은 서버가 막지 않는 허용된 행동이다.
 * @returns {{dayIndex:number, lethal:boolean, expectedDeathSeat:number|null,
 *   deadSeats:Array<number>, seats:Array<object>}}
 */
export function planNight(dayIndex) {
  if (!Number.isInteger(dayIndex) || dayIndex < 1) {
    throw new Error(`밤 계획을 세울 수 없는 dayIndex입니다: ${dayIndex}`)
  }
  const lethal = dayIndex === LETHAL_NIGHT_DAY_INDEX

  const seats = SEAT_ROLES.map((role, seatIndex) => {
    if (role === "JOKER") {
      return nightSeatPlan(seatIndex, "SUBMIT", lethal ? VICTIM_SEAT : ASSASSINATION_TARGET_SEAT, true)
    }
    if (role === "DOCTOR") {
      // 밤마다 늘 같은 좌석을 지킨다. 치명 밤에는 JOKER가 VICTIM_SEAT을 노리므로 이 보호가
      // 빗나가고, 평범한 밤에는 JOKER도 이 좌석을 노리므로 보호가 성공한다 — 보호 성패를
      // 가르는 것은 DOCTOR가 아니라 JOKER 쪽 대상이다.
      return nightSeatPlan(seatIndex, "SUBMIT", ASSASSINATION_TARGET_SEAT, true)
    }
    if (role === "GUARD") return nightSeatPlan(seatIndex, "SUBMIT", guardTargetSeat(dayIndex), true)
    if (role === "WITCH_HUNTER") {
      if (!witchHunterCanActOn(dayIndex)) return nightSeatPlan(seatIndex, "NONE", null, false)
      return nightSeatPlan(seatIndex, "SUBMIT", VICTIM_SEAT, true)
    }
    return nightSeatPlan(seatIndex, "NONE", null, false)
  }).map((plan) => ({
    ...plan,
    actionLabel: plan.action === "NONE" ? null : getInGameNightActionLabel(plan.role, dayIndex),
  }))

  return {
    dayIndex,
    lethal,
    expectedDeathSeat: lethal ? VICTIM_SEAT : null,
    deadSeats: deadSeatsAtNight(dayIndex),
    seats,
  }
}

/**
 * 낮 하나의 투표 계획을 만든다.
 * @param {number} dayIndex 그 낮의 canonical dayIndex
 * @flow 마지막 낮(FINAL_DAY_INDEX)에는 생존한 비-JOKER 전원이 JOKER를 지목하고 JOKER 본인은
 *   기권한다 — 서버가 자기 자신 투표를 SELF_TARGET_NOT_ALLOWED로 거부하고 UI 목록에도
 *   자기 자신이 없기 때문이다. 그 앞의 낮은 생존 전원 기권으로 통과해 다음 밤으로 넘어간다.
 *   사망 좌석은 어느 낮이든 deadSeatsAtDay가 정하며(치명 밤 1 이후 전부), 투표자가 아니다
 *   (alive:false) — 서버 prepareDayVoteResolution이 생존자의 제출만 기다리므로 기권 인원도
 *   생존 좌석 수(aliveSeatCount)로 계산해야 낮이 집계된다.
 *   expectedNextPhase는 집계 결과가 실제로 옮겨가는 canonical phase다 — 화면의 결과 문구는
 *   DAY 섹션 안에만 있어 전이와 동시에 사라지므로, 검증은 이 phase로 한다.
 * @returns {{dayIndex:number, expectedOutcome:string, expectedNextPhase:string,
 *   expectedTribunalSeat:number|null, aliveSeatCount:number, deadSeats:Array<number>,
 *   seats:Array<object>}}
 */
export function planDay(dayIndex) {
  if (!Number.isInteger(dayIndex) || dayIndex < 1) {
    throw new Error(`낮 계획을 세울 수 없는 dayIndex입니다: ${dayIndex}`)
  }
  const isFinalDay = dayIndex === FINAL_DAY_INDEX
  const deadSeats = deadSeatsAtDay(dayIndex)

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
    aliveSeatCount: SEAT_ROLES.length - deadSeats.length,
    deadSeats,
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
 * @flow 조사 문구와 같은 이유로 프로덕션 빌더에 위임한다. 어휘가 화면마다 다르다는 점에 주의
 *   한다 — 밤 오버레이의 CITIZEN은 "시민"이고(ingameRoleRevealData.js), "귀족"은 결과 페이지
 *   전용 어휘다(buildGameResultViewModel.js). 이 함수는 언제나 전자를 만든다.
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

/**
 * 그 역할의 밤 턴 안내 문구를 프로덕션 사전에서 파생한다.
 * @param {string} role 턴의 주인 역할
 * @param {number} dayIndex 그 밤의 canonical dayIndex
 * @flow 마녀사냥꾼의 "턴이 오지 않는다"를 검증할 때 대조할 문자열도 하드코딩하지 않기 위한
 *   함수다. 안내가 없는 역할이면 즉시 throw한다 — 빈 문자열로 대조하면 "안내가 없다"가 언제나
 *   참이 되어 검증이 통째로 무의미해진다.
 */
export function expectedNightTurnMessage(role, dayIndex) {
  const announcement = getInGameNightTurnAnnouncement(role, dayIndex)
  if (announcement === null) {
    throw new Error(`밤 턴 안내 문구를 만들 수 없습니다: ${role}/${dayIndex}`)
  }
  return announcement.message
}
