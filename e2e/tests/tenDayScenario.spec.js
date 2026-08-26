/**
 * 멀티 클라이언트 10일차 시나리오 재생.
 *
 * 브라우저 컨텍스트 5개를 띄워 로그인 → 방장이 공개 방 생성 → 나머지 넷이 공개 방 목록에서
 * 순서대로 입장 → 게임 시작 → 1일차 밤 사망 → 2~9일차 반복(보호 성공 · 마녀사냥꾼이 시신 조사)
 * → 10일차 재판 처형 → 결과 화면 → 5창 전원 로비 이탈까지 한 번에 재생한다.
 *
 * 시신을 시나리오 맨 앞에서 만드는 이유: WITCH_HUNTER는 시신이 있는 밤에만 턴을 받는다
 * (backend isEligibleForNightAction → hasAnyDeadPlayer). 첫 밤은 그 규칙 그대로 "턴이 오지
 * 않는 밤"으로 검증하고, 그 뒤 여덟 밤은 같은 시신을 반복 조사하는 밤으로 검증한다.
 *
 * 검증의 강도는 두 종류다. 진행 동작(제출·집계·전이)은 실패하면 그 자리에서 즉시 멈춘다 —
 * 진행이 어긋난 뒤의 관측은 의미가 없기 때문이다. 관측 검증(문구·활성 상태·대상 목록·사망 표시)은
 * actors.softly로 감싸 기록만 하고 끝까지 재생한 뒤, 마지막에 failureLog 요약 하나로 실패한다.
 *
 * 실행 전제(사람이 미리 갖춰야 한다 — e2e/README.md 참고):
 *   1. backend가 DEBUG_FIXED_ROLES=JOKER,DOCTOR,GUARD,WITCH_HUNTER,CITIZEN 과 함께 떠 있다.
 *   2. frontend dev 서버가 떠 있다.
 *   3. e2e/.env에 테스트 계정 5개가 있다.
 *
 * 좌석(= 입장 순서)이 곧 역할이다: S1=JOKER, S2=DOCTOR, S3=GUARD, S4=WITCH_HUNTER, S5=CITIZEN.
 */
import { expect, test } from "@playwright/test"
import * as actors from "../lib/actors.js"
import { loadE2eEnv } from "../lib/env.js"
import { createFailureLog } from "../lib/failureLog.js"
import * as selectors from "../lib/selectors.js"
import {
  FINAL_DAY_INDEX,
  FIRST_DAY_INDEX,
  LETHAL_NIGHT_DAY_INDEX,
  NORMAL_NIGHT_DAY_INDEXES,
  SEAT,
  SEAT_ROLES,
  expectedConfirmLabel,
  expectedInvestigateLabel,
  expectedKillRevealMessage,
  expectedNightTurnMessage,
  planDay,
  planNight,
} from "../lib/scenarioPlan.js"

/** 결과 화면의 직업 표시명 — buildGameResultViewModel의 GAME_RESULT_JOB_LABELS와 같은 어휘다. */
const RESULT_JOB_LABELS = Object.freeze({
  JOKER: "광대",
  CITIZEN: "귀족",
  DOCTOR: "주치의",
  GUARD: "경비원",
  WITCH_HUNTER: "귀족",
})

/**
 * 마녀사냥꾼의 밤 행동 문구. 턴이 오지 않는 밤에도 확정 버튼 자체는 이 이름으로 렌더되므로
 * (밤 행동 하한이 0이라 nightActionType이 null이 되지 않는다) 턴 부재 검증에 필요하다.
 * 문구를 적어 넣지 않고 턴이 있는 밤의 계획에서 그대로 꺼내 온다.
 */
const WITCH_HUNTER_ACTION_LABEL =
  planNight(NORMAL_NIGHT_DAY_INDEXES[0]).seats[SEAT.WITCH_HUNTER].actionLabel

test.describe.configure({ mode: "serial" })

test("5창 10일차 시나리오 — 1일차 사망 → 보호 성공 8일 · 시신 조사 → 재판 처형 → 시민 진영 승리", async ({
  browser,
}) => {
  const { accounts } = loadE2eEnv()
  /** @type {Array<object>} 좌석 5개(입장 순서 = 역할 순서) */
  const seats = []
  /** @type {Map<string,string>} 닉네임 → canonical uuid */
  const uuidByNickname = new Map()
  /** 관측 검증 실패를 모아 두었다가 시나리오 끝에서 한 번에 요약한다. */
  const failureLog = createFailureLog()

  /**
   * 좌석 index로 그 좌석의 uuid를 얻는다.
   * @param {number} seatIndex 좌석 index
   */
  const uuidOf = (seatIndex) => {
    const uuid = uuidByNickname.get(seats[seatIndex].account.nickname)
    expect(uuid, `좌석 S${seatIndex + 1}의 uuid를 찾지 못했습니다`).toBeTruthy()
    return uuid
  }

  /**
   * 5창의 지금 화면을 그 단계의 진행 기록으로 남긴다.
   * @param {string} label 단계 이름
   */
  const captureAll = async (label) => {
    for (const seat of seats) await actors.captureStep(seat, label)
  }

  /**
   * 생존 좌석 전원이 기권해 그 낮을 통과시킨다.
   * @param {number} dayIndex 그 낮의 canonical dayIndex
   * @flow 사망 좌석은 건너뛴다 — 서버가 사망자의 투표를 ACTOR_NOT_ALIVE로 거부하고, 집계도
   *   생존자의 제출만 기다린다(prepareDayVoteResolution). 그래서 기권 인원은 언제나 그 낮의
   *   생존 좌석 수와 같아야 한다.
   */
  const runAbstainDay = async (dayIndex) => {
    const dayPlan = planDay(dayIndex)
    for (const seatPlan of dayPlan.seats) {
      if (!seatPlan.alive) continue
      await actors.dayVote(seats[seatPlan.seatIndex], null)
    }
    await actors.resolveDayVote(seats[0], dayPlan.expectedNextPhase)
  }

  /**
   * 그 밤에 마녀사냥꾼 턴이 오지 않았음을 관측 검증으로 확인한다.
   * @param {number} dayIndex 그 밤의 canonical dayIndex
   * @param {string} step 실패 요약에 남길 단계 이름
   */
  const assertWitchHunterTurnAbsent = async (dayIndex, step) => {
    const seat = seats[SEAT.WITCH_HUNTER]
    await actors.softly(failureLog, step, seat, () =>
      actors.assertNightTurnAbsent(seat, {
        announcementMessage: expectedNightTurnMessage("WITCH_HUNTER", dayIndex),
        actionLabel: WITCH_HUNTER_ACTION_LABEL,
      }),
    )
  }

  try {
    await test.step("계정 5개 로그인", async () => {
      for (const account of accounts) {
        const seat = await actors.openSeat(browser, account, account.seatIndex)
        seats.push(seat)
        await actors.login(seat)
      }
      await captureAll("01-login")
    })

    await test.step("S1이 5인 공개 CUSTOM 방을 만들고 S2~S5가 목록에서 순서대로 입장", async () => {
      await actors.createRoom(seats[0])
      // 입장 순서가 곧 역할 배정 순서다 — 절대 병렬로 돌리지 않는다.
      for (const seat of seats.slice(1)) {
        await actors.joinFromRoomList(seat, seats[0].account.nickname)
      }
      await captureAll("02-room")
    })

    await test.step("전원 준비 후 방장이 게임 시작", async () => {
      for (const seat of seats) await actors.setReady(seat)
      await actors.startGame(seats[0])
      for (const seat of seats.slice(1)) await seat.page.waitForURL("**/ingame")
      await captureAll("03-start")
    })

    await test.step("각 창에서 자기 역할 공개 문구 검증", async () => {
      for (const seat of seats) {
        await actors.confirmRoleReveal(seat)
        await actors.assertSelfSeat(seat)
      }
      await captureAll("04-role-reveal")
    })

    await test.step(`부트스트랩 DAY ${FIRST_DAY_INDEX} — 전원 생존 · 요구서 루프 진입용`, async () => {
      for (const seat of seats) {
        await actors.settleOverlays(seat, { expectPhase: "DAY" })
        await actors.waitForPhase(seat, "DAY", FIRST_DAY_INDEX)
      }
      // 좌석↔uuid 표를 만든다. 각 창의 대상 목록에는 본인이 빠져 있으므로 두 창을 합친다.
      const nicknames = seats.map((seat) => seat.account.nickname)
      for (const seat of [seats[0], seats[1]]) {
        for (const [nickname, uuid] of await actors.readTargetUuids(seat, nicknames)) {
          uuidByNickname.set(nickname, uuid)
        }
      }
      expect(uuidByNickname.size, "좌석 5개의 uuid를 모두 읽지 못했습니다").toBe(SEAT_ROLES.length)

      await runAbstainDay(FIRST_DAY_INDEX)
      await captureAll(`05-day-${FIRST_DAY_INDEX}`)
    })

    const lethalPlan = planNight(LETHAL_NIGHT_DAY_INDEX)
    const victimSeat = seats[lethalPlan.expectedDeathSeat]

    await test.step(
      `NIGHT ${LETHAL_NIGHT_DAY_INDEX} — 보호 빗나감 · 마녀사냥꾼 턴 없음(시신이 없는 밤)`,
      async () => {
        const step = `NIGHT ${LETHAL_NIGHT_DAY_INDEX}`
        for (const seat of seats) {
          await actors.settleOverlays(seat, { expectPhase: "NIGHT" })
          await actors.waitForPhase(seat, "NIGHT", LETHAL_NIGHT_DAY_INDEX)
        }

        const guardSeat = seats[SEAT.GUARD]
        await actors.softly(failureLog, step, guardSeat, () =>
          actors.assertNightActionPanel(guardSeat, lethalPlan.seats[SEAT.GUARD].actionLabel),
        )
        // 밤 진입 직후 — 아직 아무도 제출하지 않은 시점.
        await assertWitchHunterTurnAbsent(LETHAL_NIGHT_DAY_INDEX, `${step} 진입 직후`)

        // 서버 턴 순서 그대로 제출한다: JOKER → DOCTOR → GUARD. WITCH_HUNTER는 이 밤에 자격이
        // 없어(turnExpected:false) 아예 부르지 않는다 — 그런데도 GUARD 제출만으로 밤이 판정되어
        // DAY로 넘어간다는 사실 자체가 "턴이 오지 않았다"의 세 번째 증거다(자격이 있었다면
        // 서버가 그 제출을 기다리느라 밤이 영영 끝나지 않는다).
        for (const seatPlan of lethalPlan.seats) {
          if (seatPlan.action === "NONE") continue
          const seat = seats[seatPlan.seatIndex]
          await actors.settleOverlays(seat)
          await actors.submitNightAction(
            seat,
            seatPlan.actionLabel,
            seatPlan.action === "SKIP" ? null : uuidOf(seatPlan.targetSeat),
          )
          // DOCTOR 제출 직후 = GUARD 턴이 열린 시점. GUARD 제출 뒤는 서버 자동 판정과 경쟁하므로
          // 그 뒤에는 이 검증을 두지 않는다.
          if (seatPlan.seatIndex === SEAT.DOCTOR) {
            await assertWitchHunterTurnAbsent(LETHAL_NIGHT_DAY_INDEX, `${step} 경호원 턴 중`)
          }
        }
        await captureAll(`06-night-${LETHAL_NIGHT_DAY_INDEX}`)
      },
    )

    await test.step(
      `사망 영상 재생 검증 · DAY ${LETHAL_NIGHT_DAY_INDEX + 1} 진입 · 사망자 표시`,
      async () => {
        const step = `DAY ${LETHAL_NIGHT_DAY_INDEX + 1} 진입`
        const killMessage = expectedKillRevealMessage(victimSeat.account.nickname)
        const guardTarget = seats[lethalPlan.seats[SEAT.GUARD].targetSeat]
        for (const seat of seats) {
          const expectPrivateResult =
            seat.index === SEAT.GUARD
              ? expectedInvestigateLabel(guardTarget.account.nickname, guardTarget.role)
              : null
          await actors.settleOverlays(seat, {
            expectKillReveal: killMessage,
            expectPrivateResult,
            expectPhase: "DAY",
          })
          await actors.waitForPhase(seat, "DAY", LETHAL_NIGHT_DAY_INDEX + 1)
          await actors.softly(failureLog, step, seat, async () => {
            await expect(
              seat.page.locator(selectors.deadPlayerCard(victimSeat.account.nickname)),
              `${seat.label}: ${victimSeat.account.nickname}이(가) 사망으로 표시되지 않았습니다`,
            ).toHaveCount(1)
            actors.assertNoDialogs(seat)
          })
        }
        await captureAll(`07-day-${LETHAL_NIGHT_DAY_INDEX + 1}-entry`)
      },
    )

    for (const night of NORMAL_NIGHT_DAY_INDEXES) {
      const nightPlan = planNight(night)
      const guardPlan = nightPlan.seats[SEAT.GUARD]
      const witchHunterPlan = nightPlan.seats[SEAT.WITCH_HUNTER]

      await test.step(`DAY ${night} — 생존 ${planDay(night).aliveSeatCount}인 기권 후 다음 밤으로`, async () => {
        await runAbstainDay(night)
        await captureAll(`08-day-${night}`)
      })

      await test.step(`NIGHT ${night} — 보호 성공 · 마녀사냥꾼이 시신을 조사`, async () => {
        const step = `NIGHT ${night}`
        for (const seat of seats) {
          await actors.settleOverlays(seat, { expectPhase: "NIGHT" })
          await actors.waitForPhase(seat, "NIGHT", night)
        }

        // 조사·확인 패널이 그 밤에 실제로 뜨는지를 제출보다 먼저 검증한다.
        for (const seatPlan of [guardPlan, witchHunterPlan]) {
          const seat = seats[seatPlan.seatIndex]
          await actors.softly(failureLog, step, seat, () =>
            actors.assertNightActionPanel(seat, seatPlan.actionLabel),
          )
        }

        // 서버 턴 순서 그대로 제출한다: JOKER → DOCTOR → GUARD → WITCH_HUNTER.
        for (const seatPlan of nightPlan.seats) {
          if (seatPlan.action === "NONE") continue
          const seat = seats[seatPlan.seatIndex]
          await actors.settleOverlays(seat)
          if (seatPlan.seatIndex === SEAT.WITCH_HUNTER) {
            // 이 시점만이 옳다 — GUARD가 막 제출해 마녀사냥꾼 턴이 열렸고(picker의 잠금이
            // 풀렸고), 아직 마녀사냥꾼 제출이 남아 있어 서버가 밤을 판정하지 않았다.
            await actors.softly(failureLog, `${step} 대상 목록`, seat, () =>
              actors.assertNightActionTargets(seat, {
                selectableUuids: nightPlan.deadSeats.map(uuidOf),
                lockedUuids: SEAT_ROLES.map((_, seatIndex) => seatIndex)
                  .filter(
                    (seatIndex) =>
                      seatIndex !== SEAT.WITCH_HUNTER && !nightPlan.deadSeats.includes(seatIndex),
                  )
                  .map(uuidOf),
              }),
            )
          }
          await actors.submitNightAction(
            seat,
            seatPlan.actionLabel,
            seatPlan.action === "SKIP" ? null : uuidOf(seatPlan.targetSeat),
          )
        }
        await captureAll(`09-night-${night}`)
      })

      await test.step(`NIGHT ${night} 결과 — 사망 영상 없음 · 개인 결과 문구 · DAY ${night + 1} 진입`, async () => {
        const step = `NIGHT ${night} 결과`
        const guardTarget = seats[guardPlan.targetSeat]
        const witchHunterTarget = seats[witchHunterPlan.targetSeat]

        for (const seat of seats) {
          const expectPrivateResult =
            seat.index === SEAT.GUARD
              ? expectedInvestigateLabel(guardTarget.account.nickname, guardTarget.role)
              : seat.index === SEAT.WITCH_HUNTER
                ? expectedConfirmLabel(witchHunterTarget.account.nickname, witchHunterTarget.role)
                : null

          // expectKillReveal을 넘기지 않으므로, 사망 연출이 뜨면 settleOverlays가 즉시 실패한다.
          await actors.settleOverlays(seat, { expectPrivateResult, expectPhase: "DAY" })
          await actors.waitForPhase(seat, "DAY", night + 1)
          await actors.softly(failureLog, step, seat, async () => {
            // 사망 좌석은 관전 상태를 그대로 유지한다.
            await expect(
              seat.page.locator(selectors.deadPlayerCard(victimSeat.account.nickname)),
              `${seat.label}: 사망 표시가 유지되지 않았습니다`,
            ).toHaveCount(1)
            actors.assertNoDialogs(seat)
          })
        }
        await captureAll(`10-night-${night}-result`)
      })
    }

    await test.step(`DAY ${FINAL_DAY_INDEX} — 생존 비-JOKER 전원이 JOKER 투표 → 재판 전이`, async () => {
      const dayPlan = planDay(FINAL_DAY_INDEX)
      for (const seatPlan of dayPlan.seats) {
        if (!seatPlan.alive) continue
        await actors.dayVote(
          seats[seatPlan.seatIndex],
          seatPlan.vote === "ABSTAIN" ? null : uuidOf(seatPlan.vote),
        )
      }
      await actors.resolveDayVote(seats[0], dayPlan.expectedNextPhase)
      for (const seat of seats) await actors.waitForPhase(seat, "TRIBUNAL", FINAL_DAY_INDEX)
      await captureAll(`11-day-${FINAL_DAY_INDEX}-tribunal`)
    })

    await test.step("재판 — 피고인 외 생존 전원 유죄 → 처형", async () => {
      for (const seatPlan of planDay(FINAL_DAY_INDEX).seats) {
        if (!seatPlan.alive || seatPlan.seatIndex === SEAT.JOKER) continue
        await actors.tribunalVoteGuilty(seats[seatPlan.seatIndex])
      }
      await actors.resolveTribunal(seats[SEAT.DOCTOR])
      await captureAll("12-tribunal")
    })

    await test.step("결과 화면 — 시민 진영 승리 · 전원 정체 공개 · 로비 버튼", async () => {
      const reveals = seats.map((seat) => ({
        nickname: seat.account.nickname,
        job: RESULT_JOB_LABELS[seat.role],
      }))
      for (const seat of seats) {
        await actors.assertGameResult(seat, seat.index === SEAT.JOKER ? "패배" : "승리", reveals)
        actors.assertNoDialogs(seat)
      }
      await captureAll("13-result")
    })

    await test.step("5창 전원 로비 이탈 — 사망 좌석 포함(연속 실행 잔존 방지)", async () => {
      for (const seat of seats) await actors.returnToLobby(seat)
      await captureAll("14-lobby")
    })

    // 종료 시 실패 요약 — 관측 검증만 여기 모인다. finally의 창 정리는 이 throw와 무관하게 돈다.
    if (failureLog.hasFailures()) throw new Error(failureLog.summary())
  } finally {
    for (const seat of seats) await actors.closeSeat(seat)
  }
})
