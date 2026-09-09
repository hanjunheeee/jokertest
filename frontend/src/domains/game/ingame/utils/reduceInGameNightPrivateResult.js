import { getInGameRoleRevealDisplay } from "../constants/roleReveal/ingameRoleRevealData.js"

/**
 * NIGHT 개인 결과(night_action_result)의 수신·표시 계약.
 *
 * 로컬 백엔드(backend/socket/gameSession.js handleResolveNight)는 개인 결과가 있는 수신자
 * 소켓에게만 이 이벤트를 개별 emit하고, payload는 다음 셋 중 하나다:
 *
 *   { gameId, dayIndex, actionType: "INVESTIGATE", targetId, role }   ← GUARD(조사)
 *   { gameId, dayIndex, actionType: "CONFIRM",     targetId, role }   ← WITCH_HUNTER(확인)
 *   { gameId, dayIndex, actionType: "ASSASSINATE", success: false }   ← JOKER(보호로 막힌 암살)
 *
 * payload에는 "누구에게 가는 결과인가"를 적은 필드가 없다(수신자 identity는 전송 경로에만
 * 있다). 그래서 본인 확인은 서버가 그 결과를 만들 수 있는 수신자 조건 전부와 대조하는 것으로
 * 한다 — 아래 세 검사는 모두 backend game-core prepareNightResolution의 실제 생성 규칙에서
 * 그대로 유도했다:
 *
 *   1. actionType ↔ 본인 역할. 개인 결과는 역할 단위로 만들어지고(privateResultBuilderByRole,
 *      game-core/gameSession.js:1514-1539) 역할은 서로 배타적이라, GUARD가 아닌 사람에게
 *      도착한 INVESTIGATE나 JOKER가 아닌 사람에게 도착한 ASSASSINATE는 서버가 보낼 수 없다.
 *   2. 본인 생존. 서버는 사망자에게 개인 결과를 아예 만들지 않는다("player.alive !== true면
 *      continue" — game-core/gameSession.js:1542-1547). 죽은 뒤 도착한 결과는 내 것이 아니다.
 *   3. 대상 ≠ 본인. 자기 자신을 지목할 수 있는 역할은 DOCTOR뿐이고
 *      (SELF_TARGET_ALLOWED_ROLES — game-core/gameSession.js:1297), 그 DOCTOR는 개인 결과를
 *      받지 않는다. 그러므로 대상이 실린 결과의 대상은 절대 본인일 수 없다.
 *
 * 이 셋을 통과하지 못한 payload는 잘못 배달됐거나 위조된 것이고 store에 들어가서는 안 된다.
 *
 * 같은 역할을 가진 "타인의 결과"는 이 계약에서 별개의 값으로 존재하지 않는다 — 개인 결과는
 * 역할 단위로 한 번 만들어져 그 역할의 생존자 전원에게 값이 같은(참조만 다른) 사본으로
 * 배달되기 때문이다(game-core/gameSession.js:1436-1437, 1510-1513). 그래서 GUARD가 둘인 밤에
 * 다른 GUARD가 받은 payload는 내가 받은 payload와 필드 단위로 동일하고, 구별할 대상 자체가
 * 없다(구별해야 할 값의 차이가 없다).
 *
 * 보호(DOCTOR)에는 개인 결과가 없다 — DOCTOR/CITIZEN은 privateResults에 등장하지 않는다
 * (game-core/gameSession.js:1432-1433). 이 계약에서 보호가 관측되는 유일한 개인 통지는
 * "보호로 암살이 막힌 밤"에 생존 JOKER에게 가는 ASSASSINATE success:false 하나이고, 그
 * 통지에는 보호자·보호자 역할·대상·사유가 어떤 필드에도 담기지 않는다
 * (buildAssassinationFailureNotice — game-core/gameSession.js:1276-1289).
 */

/** actionType → 그 결과를 받을 수 있는 유일한 본인 역할. 이 표에 없는 actionType은 전부 거부한다. */
const OWNER_ROLE_BY_ACTION_TYPE = Object.freeze({
  INVESTIGATE: "GUARD",
  CONFIRM: "WITCH_HUNTER",
  ASSASSINATE: "JOKER",
})

/** 대상의 역할이 실려 오는 actionType(조사·확인). 암살 실패 통지에는 대상 자체가 없다. */
const TARGETED_ACTION_TYPES = new Set(["INVESTIGATE", "CONFIRM"])

/** 보호로 막힌 암살 통지 문구 — 보호자·대상·사유는 payload에도 화면에도 없다. */
export const INGAME_NIGHT_PRIVATE_RESULT_ASSASSINATION_FAILED_LABEL =
  "이번 밤의 암살이 실패했습니다."

/**
 * night_action_result payload(신뢰하지 않는 외부 입력)를 store에 넣어도 되는 형태로
 * 검증·정규화한다. 하나라도 어긋나면 null이다(호출부는 store를 전혀 건드리지 않는다).
 *
 * @param {object} args
 * @param {unknown} args.payload   소켓으로 도착한 원본 payload
 * @param {string|null} args.gameId    이벤트 도착 시점의 canonical gameId
 * @param {number|null} args.dayIndex  이벤트 도착 시점의 canonical dayIndex
 * @param {string|null} args.phase     이벤트 도착 시점의 canonical phase
 * @param {string|null} args.selfRole  이벤트 도착 시점의 본인 역할(state.self.role)
 * @param {string|null} [args.selfUuid] 본인 uuid(state.self.uuid). 대상 ≠ 본인 검사에 쓴다.
 * @param {boolean|null} [args.selfAlive] 본인의 canonical 생존(selectInGameSelfAlive). 서버가
 *   사망자에게는 개인 결과를 만들지 않으므로 false면 거부한다. null("아직 모름")은 거부
 *   근거가 아니다 — roster가 아직 없는 순간에 도착한 내 결과까지 영구히 버리게 되기 때문이다
 *   (표시는 어차피 roster가 갖춰진 뒤에야 이뤄진다 — reduceInGameNightPrivateResult 참고).
 * @flow 형태 → 게임/밤 일치 → 본인 역할 대응 → 본인 생존 → actionType별 필드(대상 ≠ 본인
 *   포함) 순으로 검사하고, 통과한 값만 새 객체로 복사해 돌려준다(호출부가 원본 payload를
 *   변형해도 store에 영향이 없다).
 * @returns {{gameId:string, dayIndex:number, actionType:string, targetId:string|null, role:string|null}|null}
 */
export function parseInGameNightPrivateResultPayload({
  payload,
  gameId,
  dayIndex,
  phase,
  selfRole,
  selfUuid = null,
  selfAlive = null,
}) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (typeof gameId !== "string" || gameId.length === 0) return null
  if (typeof payload.gameId !== "string" || payload.gameId !== gameId) return null

  // 개인 결과는 그 밤의 판정 결과다 — 서버는 night_result_applied(DAY 전이)보다 먼저 보내므로
  // 도착 시점의 canonical phase는 아직 NIGHT이고 dayIndex도 그 밤의 값 그대로다.
  if (phase !== "NIGHT") return null
  if (!Number.isInteger(dayIndex)) return null
  if (!Number.isInteger(payload.dayIndex) || payload.dayIndex !== dayIndex) return null

  const ownerRole = OWNER_ROLE_BY_ACTION_TYPE[payload.actionType]
  if (ownerRole === undefined) return null
  // 본인 것만 저장한다 — 본인 역할이 그 결과의 수신 자격을 갖지 않으면 타인의 결과다.
  if (typeof selfRole !== "string" || selfRole !== ownerRole) return null

  // 서버는 사망자에게 개인 결과를 만들지 않는다 — 내가 이미 죽어 있다면 이 결과는 내 것이
  // 아니다(잘못 배달됐거나 위조됐다). "아직 모름"(null)은 거부하지 않는다(위 @param 참고).
  if (selfAlive === false) return null

  if (TARGETED_ACTION_TYPES.has(payload.actionType)) {
    if (typeof payload.targetId !== "string" || payload.targetId.length === 0) return null
    // 대상이 실린 결과의 대상은 절대 본인이 아니다 — 자기 지목이 허용되는 역할은 DOCTOR
    // 하나뿐이고 DOCTOR는 개인 결과를 받지 않는다. 본인이 대상인 결과는 서버가 만들 수 없다.
    if (typeof selfUuid === "string" && selfUuid.length > 0 && payload.targetId === selfUuid) {
      return null
    }
    // 서버는 대상의 실제 role을 보낸다(진영이 아니다 — game-core prepareNightResolution 참고).
    if (getInGameRoleRevealDisplay(payload.role) === null) return null
    return {
      gameId: payload.gameId,
      dayIndex: payload.dayIndex,
      actionType: payload.actionType,
      targetId: payload.targetId,
      role: payload.role,
    }
  }

  // ASSASSINATE는 보호로 막힌 밤에만, 그리고 실패로만 온다. 성공한 암살은 개인 통지가 아니라
  // 공개 사망(night_result_applied)으로 알려지므로 success:true는 서버가 보내지 않는다.
  if (payload.success !== false) return null
  return {
    gameId: payload.gameId,
    dayIndex: payload.dayIndex,
    actionType: payload.actionType,
    targetId: null,
    role: null,
  }
}

/**
 * 저장된 개인 결과를 화면에 그대로 쓸 수 있는 표시 데이터로 바꾼다(순수 함수).
 *
 * 표시 문구는 역할 공개 표시 데이터(getInGameRoleRevealDisplay)를 재사용해 만들어 "광대"·
 * "마녀사냥꾼" 같은 표기가 역할 공개 화면과 어긋나지 않게 한다.
 *
 * 대상 uuid를 roster에서 찾지 못하면 uuid를 대신 노출하지 않고 표시 자체를 포기한다(null) —
 * 조사 결과는 대상이 누구인지 확정되지 않으면 아무 의미가 없기 때문이다.
 *
 * @param {object|null} payload parseInGameNightPrivateResultPayload가 통과시킨 값
 * @param {Array|null} players canonical roster([{ uuid, nickname, ... }])
 * @returns {{kind: string, targetNickname: string|null, label: string}|null}
 */
export function reduceInGameNightPrivateResult(payload, players) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (!Array.isArray(players)) return null

  if (payload.actionType === "ASSASSINATE") {
    if (payload.success !== undefined && payload.success !== false) return null
    return {
      kind: "ASSASSINATE",
      targetNickname: null,
      label: INGAME_NIGHT_PRIVATE_RESULT_ASSASSINATION_FAILED_LABEL,
    }
  }

  if (!TARGETED_ACTION_TYPES.has(payload.actionType)) return null
  if (typeof payload.targetId !== "string" || payload.targetId.length === 0) return null

  const target = players.find((p) => p && p.uuid === payload.targetId) ?? null
  if (target === null) return null
  if (typeof target.nickname !== "string" || target.nickname.length === 0) return null

  const display = getInGameRoleRevealDisplay(payload.role)
  if (display === null) return null

  const verb = payload.actionType === "INVESTIGATE" ? "조사" : "확인"
  return {
    kind: payload.actionType,
    targetNickname: target.nickname,
    label: `${verb} 결과, ${target.nickname} 님의 역할은 ${display.name}입니다.`,
  }
}
