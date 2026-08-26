import assert from "node:assert/strict"
import test from "node:test"
import {
  DEBUG_FIXED_ROLES_VALUE,
  FINAL_DAY_INDEX,
  LETHAL_NIGHT_DAY_INDEX,
  NORMAL_NIGHT_COUNT,
  ROOM_SETUP_PLAN,
  SEAT,
  SEAT_COUNT,
  SEAT_ROLES,
  expectedConfirmLabel,
  expectedInvestigateLabel,
  expectedKillRevealMessage,
  expectedRoleRevealTexts,
  planDay,
  planNight,
  seatRole,
  seatTeam,
  witchHunterCanActOn,
} from "../scenarioPlan.js"

/** 평범한 밤(보호 성공, 아무도 죽지 않는 밤)의 dayIndex 목록. */
const NORMAL_NIGHTS = Array.from({ length: NORMAL_NIGHT_COUNT }, (_, index) => index + 1)

/**
 * 밤 계획에서 특정 좌석의 항목을 꺼낸다.
 * @param {object} plan planNight 결과
 * @param {number} seatIndex 좌석 index
 */
function seatOf(plan, seatIndex) {
  return plan.seats.find((seat) => seat.seatIndex === seatIndex)
}

test("좌석 표는 backend DEBUG_FIXED_ROLES 값과 순서가 같다", () => {
  assert.equal(DEBUG_FIXED_ROLES_VALUE, "JOKER,DOCTOR,GUARD,WITCH_HUNTER,CITIZEN")
  assert.equal(SEAT_COUNT, 5)
  assert.equal(seatRole(SEAT.GUARD), "GUARD")
  assert.equal(seatRole(SEAT.CITIZEN), "CITIZEN")
  assert.equal(seatRole(99), null)
})

test("진영 파생은 JOKER만 광대 진영이다", () => {
  assert.equal(seatTeam("JOKER"), "JOKER")
  for (const role of ["CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"]) {
    assert.equal(seatTeam(role), "CITIZEN")
  }
})

test("ROOM_SETUP_PLAN은 정원 축소 → CUSTOM 전환 → 역할 인원 순서로 조작한다", () => {
  assert.deepEqual(
    ROOM_SETUP_PLAN.map((step) => step.label),
    ["최대 플레이어 수", "역할 구성", "광대 인원", "의사 인원", "경비대 인원", "마녀사냥꾼 인원"],
  )
})

test("ROOM_SETUP_PLAN은 체크박스를 건드리지 않는다(방이 공개여야 목록에서 입장할 수 있다)", () => {
  // "코드로만 참가"를 켜면 accessType이 "code"가 되어 공개 목록 입장 버튼이 잠기고
  // 서버도 join_public_room을 거부한다 — 그 조작이 계획에 되살아나지 않게 고정한다.
  assert.equal(
    ROOM_SETUP_PLAN.some((step) => step.kind === "checkbox"),
    false,
  )
})

test("ROOM_SETUP_PLAN의 클릭 횟수는 기본값에서 목표값까지의 실제 거리와 같다", () => {
  const byLabel = Object.fromEntries(ROOM_SETUP_PLAN.map((step) => [step.label, step]))
  // 최대 플레이어 수: 기본 10 → 5 (옵션 4..10에서 다섯 칸 감소)
  assert.deepEqual(byLabel["최대 플레이어 수"], {
    kind: "stepper",
    label: "최대 플레이어 수",
    direction: "decrease",
    clicks: 5,
  })
  // 역할 구성: 자동 → 직접 지정 (한 칸 증가)
  assert.equal(byLabel["역할 구성"].direction, "increase")
  assert.equal(byLabel["역할 구성"].clicks, 1)
  // 광대: CUSTOM 전환 시 AUTO의 2를 승계하므로 1로 내린다
  assert.equal(byLabel["광대 인원"].direction, "decrease")
  assert.equal(byLabel["광대 인원"].clicks, 1)
  for (const label of ["의사 인원", "경비대 인원", "마녀사냥꾼 인원"]) {
    assert.equal(byLabel[label].direction, "increase")
    assert.equal(byLabel[label].clicks, 1)
  }
})

test("witchHunterCanActOn은 day0에서만 false다(요구서의 skip 분기를 여기서 고정한다)", () => {
  assert.equal(witchHunterCanActOn(0), false)
  assert.equal(witchHunterCanActOn(1), true)
  assert.equal(witchHunterCanActOn(LETHAL_NIGHT_DAY_INDEX), true)
})

test("평범한 밤에는 JOKER와 DOCTOR가 같은 대상(CITIZEN)을 지목해 아무도 죽지 않는다", () => {
  for (const dayIndex of NORMAL_NIGHTS) {
    const plan = planNight(dayIndex)
    assert.equal(plan.lethal, false)
    assert.equal(plan.expectedDeathSeat, null)
    assert.equal(seatOf(plan, SEAT.JOKER).targetSeat, SEAT.CITIZEN)
    assert.equal(seatOf(plan, SEAT.DOCTOR).targetSeat, SEAT.CITIZEN)
    assert.equal(seatOf(plan, SEAT.JOKER).actionLabel, "암살")
    assert.equal(seatOf(plan, SEAT.DOCTOR).actionLabel, "보호")
  }
})

test("GUARD·WITCH_HUNTER는 평범한 밤마다 다른 대상을 보고, 자기 자신은 절대 보지 않는다", () => {
  let previousGuard = null
  let previousWitchHunter = null
  for (const dayIndex of NORMAL_NIGHTS) {
    const plan = planNight(dayIndex)
    const guard = seatOf(plan, SEAT.GUARD)
    const witchHunter = seatOf(plan, SEAT.WITCH_HUNTER)

    assert.equal(guard.action, "SUBMIT")
    assert.equal(witchHunter.action, "SUBMIT")
    assert.notEqual(guard.targetSeat, SEAT.GUARD, `밤 ${dayIndex}: GUARD가 자기 자신을 조사한다`)
    assert.notEqual(
      witchHunter.targetSeat,
      SEAT.WITCH_HUNTER,
      `밤 ${dayIndex}: WITCH_HUNTER가 자기 자신을 확인한다`,
    )
    assert.notEqual(guard.targetSeat, previousGuard, `밤 ${dayIndex}: GUARD 대상이 어제와 같다`)
    assert.notEqual(
      witchHunter.targetSeat,
      previousWitchHunter,
      `밤 ${dayIndex}: WITCH_HUNTER 대상이 어제와 같다`,
    )
    assert.notEqual(
      guard.targetSeat,
      witchHunter.targetSeat,
      `밤 ${dayIndex}: 두 조사 대상이 겹쳐 결과 문구를 구분할 수 없다`,
    )
    previousGuard = guard.targetSeat
    previousWitchHunter = witchHunter.targetSeat
  }
})

test("GUARD·WITCH_HUNTER 대상은 4밤 주기로 순환하며 풀 전체를 한 번씩 훑는다", () => {
  const guardTargets = NORMAL_NIGHTS.map((dayIndex) => seatOf(planNight(dayIndex), SEAT.GUARD).targetSeat)
  const witchHunterTargets = NORMAL_NIGHTS.map(
    (dayIndex) => seatOf(planNight(dayIndex), SEAT.WITCH_HUNTER).targetSeat,
  )
  assert.deepEqual(new Set(guardTargets.slice(0, 4)).size, 4)
  assert.deepEqual(new Set(witchHunterTargets.slice(0, 4)).size, 4)
  assert.deepEqual(guardTargets.slice(0, 4), guardTargets.slice(4, 8))
  assert.deepEqual(witchHunterTargets.slice(0, 4), witchHunterTargets.slice(4, 8))
})

test("CITIZEN은 어떤 밤에도 행동하지 않는다", () => {
  for (const dayIndex of [...NORMAL_NIGHTS, LETHAL_NIGHT_DAY_INDEX]) {
    const citizen = seatOf(planNight(dayIndex), SEAT.CITIZEN)
    assert.equal(citizen.action, "NONE")
    assert.equal(citizen.targetSeat, null)
    assert.equal(citizen.actionLabel, null)
  }
})

test("10일차 밤은 DOCTOR가 GUARD를 보호해 CITIZEN이 죽고, GUARD·WH는 건너뛴다", () => {
  const plan = planNight(LETHAL_NIGHT_DAY_INDEX)
  assert.equal(plan.lethal, true)
  assert.equal(plan.expectedDeathSeat, SEAT.CITIZEN)
  assert.equal(seatOf(plan, SEAT.JOKER).targetSeat, SEAT.CITIZEN)
  assert.equal(seatOf(plan, SEAT.DOCTOR).targetSeat, SEAT.GUARD)
  assert.equal(seatOf(plan, SEAT.GUARD).action, "SKIP")
  assert.equal(seatOf(plan, SEAT.WITCH_HUNTER).action, "SKIP")
})

test("planNight은 잘못된 dayIndex를 조용히 넘기지 않는다", () => {
  assert.throws(() => planNight(0), /dayIndex/)
  assert.throws(() => planNight(1.5), /dayIndex/)
})

test("1~10일차 낮은 전원 기권으로 통과한다", () => {
  for (let dayIndex = 1; dayIndex <= LETHAL_NIGHT_DAY_INDEX; dayIndex += 1) {
    const plan = planDay(dayIndex)
    assert.equal(plan.expectedOutcome, "ABSTAINED")
    assert.equal(plan.expectedNextPhase, "NIGHT")
    assert.equal(plan.expectedTribunalSeat, null)
    assert.equal(plan.seats.length, SEAT_ROLES.length)
    for (const seat of plan.seats) {
      assert.equal(seat.alive, true)
      assert.equal(seat.vote, "ABSTAIN")
    }
  }
})

test("마지막 낮에는 생존한 비-JOKER 셋이 JOKER를 지목하고 JOKER는 기권한다", () => {
  const plan = planDay(FINAL_DAY_INDEX)
  assert.equal(plan.expectedOutcome, "TRIBUNAL")
  assert.equal(plan.expectedNextPhase, "TRIBUNAL")
  assert.equal(plan.expectedTribunalSeat, SEAT.JOKER)

  const dead = plan.seats.filter((seat) => !seat.alive)
  assert.deepEqual(
    dead.map((seat) => seat.seatIndex),
    [SEAT.CITIZEN],
  )
  assert.equal(dead[0].vote, null)

  const jokerVoters = plan.seats.filter((seat) => seat.vote === SEAT.JOKER)
  assert.deepEqual(
    jokerVoters.map((seat) => seat.seatIndex),
    [SEAT.DOCTOR, SEAT.GUARD, SEAT.WITCH_HUNTER],
  )
  assert.equal(plan.seats.find((seat) => seat.seatIndex === SEAT.JOKER).vote, "ABSTAIN")
})

test("어떤 낮에도 자기 자신에게 투표하지 않는다(서버가 SELF_TARGET_NOT_ALLOWED로 거부한다)", () => {
  for (let dayIndex = 1; dayIndex <= FINAL_DAY_INDEX; dayIndex += 1) {
    for (const seat of planDay(dayIndex).seats) {
      assert.notEqual(seat.vote, seat.seatIndex, `낮 ${dayIndex}: 좌석 ${seat.seatIndex}가 자기를 지목한다`)
    }
  }
})

test("조사 결과 문구는 대상의 실제 진영과 일치한다", () => {
  assert.equal(expectedInvestigateLabel("테스터1", "JOKER"), "테스터1 님은 광대 진영입니다")
  assert.equal(expectedInvestigateLabel("테스터5", "CITIZEN"), "테스터5 님은 시민 진영입니다")
  assert.equal(expectedInvestigateLabel("테스터2", "DOCTOR"), "테스터2 님은 시민 진영입니다")
})

test("확인 결과 문구는 대상의 실제 역할명을 그대로 쓴다", () => {
  assert.equal(expectedConfirmLabel("테스터1", "JOKER"), "테스터1 님의 역할은 광대입니다")
  assert.equal(expectedConfirmLabel("테스터3", "GUARD"), "테스터3 님의 역할은 경비대입니다")
  assert.equal(expectedConfirmLabel("테스터4", "WITCH_HUNTER"), "테스터4 님의 역할은 마녀사냥꾼입니다")
})

test("결과 문구 빌더는 알 수 없는 역할에서 조용히 빈 문구를 만들지 않는다", () => {
  assert.throws(() => expectedConfirmLabel("테스터1", "NOT_A_ROLE"), /확인 결과 문구/)
  assert.throws(() => expectedRoleRevealTexts("NOT_A_ROLE"), /알 수 없는 역할/)
})

test("사망 연출 문구는 살해자 정체 대신 진영 단위 표현만 쓴다", () => {
  assert.equal(expectedKillRevealMessage("테스터5"), "광대들이 테스터5 님을 죽였습니다.")
})

test("역할 공개 기대 문구는 좌석 다섯 개 모두에 대해 만들어진다", () => {
  assert.deepEqual(expectedRoleRevealTexts("JOKER"), { name: "광대", teamLabel: "광대 진영" })
  assert.deepEqual(expectedRoleRevealTexts("WITCH_HUNTER"), {
    name: "마녀사냥꾼",
    teamLabel: "시민 진영",
  })
  for (const role of SEAT_ROLES) {
    const texts = expectedRoleRevealTexts(role)
    assert.equal(typeof texts.name, "string")
    assert.ok(texts.name.length > 0)
    assert.equal(texts.teamLabel, role === "JOKER" ? "광대 진영" : "시민 진영")
  }
})
