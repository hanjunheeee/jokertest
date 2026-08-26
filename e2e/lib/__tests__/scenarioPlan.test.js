import assert from "node:assert/strict"
import test from "node:test"
import {
  ASSASSINATION_TARGET_SEAT,
  DEBUG_FIXED_ROLES_VALUE,
  FINAL_DAY_INDEX,
  FIRST_DAY_INDEX,
  LETHAL_NIGHT_DAY_INDEX,
  NORMAL_NIGHT_COUNT,
  NORMAL_NIGHT_DAY_INDEXES,
  ROOM_SETUP_PLAN,
  SEAT,
  SEAT_COUNT,
  SEAT_ROLES,
  VICTIM_SEAT,
  aliveSeatsAtDay,
  deadSeatsAtDay,
  deadSeatsAtNight,
  expectedConfirmLabel,
  expectedInvestigateLabel,
  expectedKillRevealMessage,
  expectedNightTurnMessage,
  expectedRoleRevealTexts,
  planDay,
  planNight,
  seatRole,
  seatTeam,
  witchHunterCanActOn,
} from "../scenarioPlan.js"

/** 평범한 밤(보호 성공, 아무도 죽지 않는 밤)의 dayIndex 목록. */
const NORMAL_NIGHTS = NORMAL_NIGHT_DAY_INDEXES

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

test("새 타임라인 상수는 치명 밤 1 + 평범한 밤 2~9 + 최종 낮 10이다", () => {
  assert.equal(FIRST_DAY_INDEX, 1)
  assert.equal(LETHAL_NIGHT_DAY_INDEX, 1)
  assert.equal(FINAL_DAY_INDEX, 10)
  assert.deepEqual([...NORMAL_NIGHT_DAY_INDEXES], [2, 3, 4, 5, 6, 7, 8, 9])
  assert.equal(NORMAL_NIGHT_COUNT, 8)
  assert.equal(VICTIM_SEAT, SEAT.CITIZEN)
  assert.equal(ASSASSINATION_TARGET_SEAT, SEAT.GUARD)
})

test("시신은 치명 밤이 판정된 뒤에야 생긴다(그 밤 당일에는 아직 없다)", () => {
  assert.deepEqual(deadSeatsAtNight(LETHAL_NIGHT_DAY_INDEX), [])
  assert.deepEqual(deadSeatsAtNight(LETHAL_NIGHT_DAY_INDEX + 1), [VICTIM_SEAT])
  assert.deepEqual(deadSeatsAtDay(FIRST_DAY_INDEX), [])
  assert.deepEqual(deadSeatsAtDay(LETHAL_NIGHT_DAY_INDEX + 1), [VICTIM_SEAT])
  assert.deepEqual(aliveSeatsAtDay(FIRST_DAY_INDEX), [0, 1, 2, 3, 4])
  assert.deepEqual(
    aliveSeatsAtDay(FINAL_DAY_INDEX),
    [SEAT.JOKER, SEAT.DOCTOR, SEAT.GUARD, SEAT.WITCH_HUNTER],
  )
})

test("witchHunterCanActOn은 시신이 있는 밤에만 true다(새 마녀사냥꾼 규칙을 여기서 고정한다)", () => {
  assert.equal(witchHunterCanActOn(0), false)
  assert.equal(witchHunterCanActOn(LETHAL_NIGHT_DAY_INDEX), false)
  for (const dayIndex of NORMAL_NIGHTS) {
    assert.equal(witchHunterCanActOn(dayIndex), true, `밤 ${dayIndex}: 시신이 있는데 행동 불가다`)
  }
  assert.equal(witchHunterCanActOn(1.5), false)
  assert.equal(witchHunterCanActOn(-1), false)
})

test("치명 밤은 JOKER와 DOCTOR가 다른 좌석을 지목해 보호가 빗나가고 CITIZEN이 죽는다", () => {
  const plan = planNight(LETHAL_NIGHT_DAY_INDEX)
  assert.equal(plan.lethal, true)
  assert.equal(plan.expectedDeathSeat, VICTIM_SEAT)
  assert.deepEqual(plan.deadSeats, [])
  assert.equal(seatOf(plan, SEAT.JOKER).targetSeat, VICTIM_SEAT)
  assert.equal(seatOf(plan, SEAT.DOCTOR).targetSeat, ASSASSINATION_TARGET_SEAT)
  assert.notEqual(seatOf(plan, SEAT.JOKER).targetSeat, seatOf(plan, SEAT.DOCTOR).targetSeat)
  assert.equal(seatOf(plan, SEAT.GUARD).action, "SUBMIT")
})

test("치명 밤의 WITCH_HUNTER는 턴 자체가 오지 않는다", () => {
  const witchHunter = seatOf(planNight(LETHAL_NIGHT_DAY_INDEX), SEAT.WITCH_HUNTER)
  assert.equal(witchHunter.action, "NONE")
  assert.equal(witchHunter.turnExpected, false)
  assert.equal(witchHunter.targetSeat, null)
  assert.equal(witchHunter.actionLabel, null)
})

test("평범한 밤에는 JOKER와 DOCTOR가 같은 대상을 지목해 아무도 죽지 않는다", () => {
  for (const dayIndex of NORMAL_NIGHTS) {
    const plan = planNight(dayIndex)
    assert.equal(plan.lethal, false)
    assert.equal(plan.expectedDeathSeat, null)
    assert.deepEqual(plan.deadSeats, [VICTIM_SEAT])
    assert.equal(seatOf(plan, SEAT.JOKER).targetSeat, ASSASSINATION_TARGET_SEAT)
    assert.equal(seatOf(plan, SEAT.DOCTOR).targetSeat, ASSASSINATION_TARGET_SEAT)
    assert.equal(seatOf(plan, SEAT.JOKER).actionLabel, "암살")
    assert.equal(seatOf(plan, SEAT.DOCTOR).actionLabel, "보호")
  }
})

test("평범한 밤의 WITCH_HUNTER는 매 밤 같은 시신을 다시 조사한다(반복 조사 허용)", () => {
  for (const dayIndex of NORMAL_NIGHTS) {
    const witchHunter = seatOf(planNight(dayIndex), SEAT.WITCH_HUNTER)
    assert.equal(witchHunter.action, "SUBMIT")
    assert.equal(witchHunter.turnExpected, true)
    assert.equal(witchHunter.actionLabel, "확인")
    assert.equal(witchHunter.targetSeat, VICTIM_SEAT, `밤 ${dayIndex}: 시신이 아닌 좌석을 확인한다`)
  }
})

test("GUARD는 밤마다 다른 생존자를 조사하고, 자기 자신도 시신도 절대 보지 않는다", () => {
  let previousGuard = null
  for (const dayIndex of [LETHAL_NIGHT_DAY_INDEX, ...NORMAL_NIGHTS]) {
    const plan = planNight(dayIndex)
    const guard = seatOf(plan, SEAT.GUARD)

    assert.equal(guard.action, "SUBMIT")
    assert.equal(guard.turnExpected, true)
    assert.notEqual(guard.targetSeat, SEAT.GUARD, `밤 ${dayIndex}: GUARD가 자기 자신을 조사한다`)
    assert.equal(
      plan.deadSeats.includes(guard.targetSeat),
      false,
      `밤 ${dayIndex}: GUARD가 시신을 조사한다(그 버튼은 잠겨 있어 클릭할 수 없다)`,
    )
    assert.notEqual(guard.targetSeat, previousGuard, `밤 ${dayIndex}: GUARD 대상이 어제와 같다`)
    previousGuard = guard.targetSeat
  }
})

test("GUARD 대상은 3밤 주기로 순환하며 풀 전체를 훑고 두 진영 문구를 모두 만든다", () => {
  const targets = [LETHAL_NIGHT_DAY_INDEX, ...NORMAL_NIGHTS].map(
    (dayIndex) => seatOf(planNight(dayIndex), SEAT.GUARD).targetSeat,
  )
  assert.equal(new Set(targets.slice(0, 3)).size, 3)
  assert.deepEqual(targets.slice(0, 3), targets.slice(3, 6))
  assert.deepEqual(targets.slice(0, 3), targets.slice(6, 9))
  // JOKER(광대 진영)와 시민 진영 좌석이 모두 조사 대상이 되어야 두 문구가 다 나온다.
  assert.equal(targets.includes(SEAT.JOKER), true)
  assert.equal(
    targets.some((seatIndex) => seatTeam(seatRole(seatIndex)) === "CITIZEN"),
    true,
  )
})

test("CITIZEN은 어떤 밤에도 행동하지 않고 턴도 오지 않는다", () => {
  for (const dayIndex of [LETHAL_NIGHT_DAY_INDEX, ...NORMAL_NIGHTS]) {
    const citizen = seatOf(planNight(dayIndex), SEAT.CITIZEN)
    assert.equal(citizen.action, "NONE")
    assert.equal(citizen.turnExpected, false)
    assert.equal(citizen.targetSeat, null)
    assert.equal(citizen.actionLabel, null)
  }
})

test("planNight은 잘못된 dayIndex를 조용히 넘기지 않는다", () => {
  assert.throws(() => planNight(0), /dayIndex/)
  assert.throws(() => planNight(1.5), /dayIndex/)
})

test("부트스트랩 낮은 전원 생존 5인이 기권한다", () => {
  const plan = planDay(FIRST_DAY_INDEX)
  assert.equal(plan.expectedOutcome, "ABSTAINED")
  assert.equal(plan.expectedNextPhase, "NIGHT")
  assert.equal(plan.expectedTribunalSeat, null)
  assert.equal(plan.aliveSeatCount, SEAT_ROLES.length)
  assert.deepEqual(plan.deadSeats, [])
  assert.equal(plan.seats.length, SEAT_ROLES.length)
  for (const seat of plan.seats) {
    assert.equal(seat.alive, true)
    assert.equal(seat.vote, "ABSTAIN")
  }
})

test("2~9일차 낮은 CITIZEN을 뺀 생존 4인만 기권한다(생존자 기준 계산)", () => {
  for (const dayIndex of NORMAL_NIGHTS) {
    const plan = planDay(dayIndex)
    assert.equal(plan.expectedOutcome, "ABSTAINED")
    assert.equal(plan.expectedNextPhase, "NIGHT")
    assert.equal(plan.aliveSeatCount, 4, `낮 ${dayIndex}: 생존 인원이 4가 아니다`)
    assert.deepEqual(plan.deadSeats, [VICTIM_SEAT])

    const citizen = plan.seats.find((seat) => seat.seatIndex === VICTIM_SEAT)
    assert.equal(citizen.alive, false)
    assert.equal(citizen.vote, null)
    for (const seat of plan.seats) {
      if (seat.seatIndex === VICTIM_SEAT) continue
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
  assert.equal(plan.aliveSeatCount, 4)

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
  for (let dayIndex = FIRST_DAY_INDEX; dayIndex <= FINAL_DAY_INDEX; dayIndex += 1) {
    for (const seat of planDay(dayIndex).seats) {
      assert.notEqual(seat.vote, seat.seatIndex, `낮 ${dayIndex}: 좌석 ${seat.seatIndex}가 자기를 지목한다`)
    }
  }
})

test("사망 좌석은 어떤 낮에도 투표자로 계획되지 않는다", () => {
  for (let dayIndex = FIRST_DAY_INDEX; dayIndex <= FINAL_DAY_INDEX; dayIndex += 1) {
    const plan = planDay(dayIndex)
    assert.equal(
      plan.seats.filter((seat) => seat.alive).length,
      plan.aliveSeatCount,
      `낮 ${dayIndex}: alive 좌석 수와 aliveSeatCount가 어긋난다`,
    )
    for (const seat of plan.seats) {
      if (seat.alive) continue
      assert.equal(seat.vote, null, `낮 ${dayIndex}: 사망 좌석 ${seat.seatIndex}가 투표한다`)
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
  // 시신(CITIZEN)을 확인했을 때의 문구. 밤 오버레이의 어휘는 "시민"이고(ingameRoleRevealData),
  // 요구서가 말하는 "귀족"은 결과 페이지 전용 어휘다(buildGameResultViewModel) — 두 화면이
  // 서로 다른 사전을 쓰는 것이 프로덕션의 계약이므로 여기서는 밤 화면 쪽을 고정한다.
  assert.equal(expectedConfirmLabel("테스터5", "CITIZEN"), "테스터5 님의 역할은 시민입니다")
})

test("밤 턴 안내 문구도 프로덕션 사전에서만 파생한다", () => {
  assert.equal(expectedNightTurnMessage("WITCH_HUNTER", LETHAL_NIGHT_DAY_INDEX), "마녀사냥꾼의 시간입니다")
  assert.equal(expectedNightTurnMessage("GUARD", LETHAL_NIGHT_DAY_INDEX), "경호원의 시간입니다")
  // 안내가 없는 역할에서 빈 문자열을 만들면 "안내가 뜨지 않았다"가 언제나 참이 되어버린다.
  assert.throws(() => expectedNightTurnMessage("CITIZEN", 1), /밤 턴 안내 문구/)
  assert.throws(() => expectedNightTurnMessage("NOT_A_ROLE", 1), /밤 턴 안내 문구/)
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
