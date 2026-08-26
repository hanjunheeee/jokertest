/**
 * 멀티 클라이언트 10일차 시나리오 재생.
 *
 * 브라우저 컨텍스트 5개를 띄워 로그인 → 방장이 공개 방 생성 → 나머지 넷이 공개 방 목록에서
 * 순서대로 입장 → 게임 시작 → 1~9일차 반복 → 10일차 사망 → 재판 처형 → 결과 화면까지 한 번에
 * 재생한다.
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
import * as selectors from "../lib/selectors.js"
import {
  FINAL_DAY_INDEX,
  FIRST_DAY_INDEX,
  LETHAL_NIGHT_DAY_INDEX,
  NORMAL_NIGHT_COUNT,
  SEAT,
  SEAT_ROLES,
  expectedConfirmLabel,
  expectedInvestigateLabel,
  expectedKillRevealMessage,
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

test.describe.configure({ mode: "serial" })

test("5창 10일차 시나리오 — 보호 성공 9일 → 10일차 사망 → 재판 처형 → 시민 진영 승리", async ({
  browser,
}) => {
  const { accounts } = loadE2eEnv()
  /** @type {Array<object>} 좌석 5개(입장 순서 = 역할 순서) */
  const seats = []
  /** @type {Map<string,string>} 닉네임 → canonical uuid */
  const uuidByNickname = new Map()

  /**
   * 좌석 index로 그 좌석의 uuid를 얻는다.
   * @param {number} seatIndex 좌석 index
   */
  const uuidOf = (seatIndex) => {
    const uuid = uuidByNickname.get(seats[seatIndex].account.nickname)
    expect(uuid, `좌석 S${seatIndex + 1}의 uuid를 찾지 못했습니다`).toBeTruthy()
    return uuid
  }

  try {
    await test.step("계정 5개 로그인", async () => {
      for (const account of accounts) {
        const seat = await actors.openSeat(browser, account, account.seatIndex)
        seats.push(seat)
        await actors.login(seat)
      }
    })

    await test.step("S1이 5인 공개 CUSTOM 방을 만들고 S2~S5가 목록에서 순서대로 입장", async () => {
      await actors.createRoom(seats[0])
      // 입장 순서가 곧 역할 배정 순서다 — 절대 병렬로 돌리지 않는다.
      for (const seat of seats.slice(1)) {
        await actors.joinFromRoomList(seat, seats[0].account.nickname)
      }
    })

    await test.step("전원 준비 후 방장이 게임 시작", async () => {
      for (const seat of seats) await actors.setReady(seat)
      await actors.startGame(seats[0])
      for (const seat of seats.slice(1)) await seat.page.waitForURL("**/ingame")
    })

    await test.step("각 창에서 자기 역할 공개 문구 검증", async () => {
      for (const seat of seats) {
        await actors.confirmRoleReveal(seat)
        await actors.assertSelfSeat(seat)
      }
    })

    await test.step(`부트스트랩 DAY ${FIRST_DAY_INDEX} — 요구서 루프 진입용`, async () => {
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

      const dayPlan = planDay(FIRST_DAY_INDEX)
      for (const seatPlan of dayPlan.seats) await actors.dayVote(seats[seatPlan.seatIndex], null)
      await actors.resolveDayVote(seats[0], dayPlan.expectedNextPhase)
    })

    for (let night = 1; night <= NORMAL_NIGHT_COUNT; night += 1) {
      const nightPlan = planNight(night)
      const guardPlan = nightPlan.seats[SEAT.GUARD]
      const witchHunterPlan = nightPlan.seats[SEAT.WITCH_HUNTER]

      await test.step(`NIGHT ${night} — 보호 성공(아무도 죽지 않는 밤)`, async () => {
        for (const seat of seats) {
          await actors.settleOverlays(seat, { expectPhase: "NIGHT" })
          await actors.waitForPhase(seat, "NIGHT", night)
        }

        // 조사·확인 패널이 그 밤에 실제로 뜨는지를 제출보다 먼저 검증한다.
        await actors.assertNightActionPanel(seats[SEAT.GUARD], guardPlan.actionLabel)
        await actors.assertNightActionPanel(seats[SEAT.WITCH_HUNTER], witchHunterPlan.actionLabel)

        // 서버 턴 순서 그대로 제출한다: JOKER → DOCTOR → GUARD → WITCH_HUNTER.
        for (const seatPlan of nightPlan.seats) {
          if (seatPlan.action === "NONE") continue
          const seat = seats[seatPlan.seatIndex]
          await actors.settleOverlays(seat)
          await actors.submitNightAction(
            seat,
            seatPlan.actionLabel,
            seatPlan.action === "SKIP" ? null : uuidOf(seatPlan.targetSeat),
          )
        }
      })

      await test.step(`NIGHT ${night} 결과 — 사망 영상 없음 · 개인 결과 문구 · DAY ${night + 1} 진입`, async () => {
        const guardTargetSeat = seats[guardPlan.targetSeat]
        const witchHunterTargetSeat = seats[witchHunterPlan.targetSeat]

        for (const seat of seats) {
          const isGuard = seat.index === SEAT.GUARD
          const isWitchHunter = seat.index === SEAT.WITCH_HUNTER
          const expectPrivateResult = isGuard
            ? expectedInvestigateLabel(guardTargetSeat.account.nickname, guardTargetSeat.role)
            : isWitchHunter
              ? expectedConfirmLabel(witchHunterTargetSeat.account.nickname, witchHunterTargetSeat.role)
              : null

          // expectKillReveal을 넘기지 않으므로, 사망 연출이 뜨면 settleOverlays가 즉시 실패한다.
          await actors.settleOverlays(seat, { expectPrivateResult, expectPhase: "DAY" })
          await actors.waitForPhase(seat, "DAY", night + 1)
          actors.assertNoDialogs(seat)
        }
      })

      await test.step(`DAY ${night + 1} — 전원 기권 후 다음 밤으로`, async () => {
        const dayPlan = planDay(night + 1)
        for (const seatPlan of dayPlan.seats) await actors.dayVote(seats[seatPlan.seatIndex], null)
        await actors.resolveDayVote(seats[0], dayPlan.expectedNextPhase)
      })
    }

    const lethalPlan = planNight(LETHAL_NIGHT_DAY_INDEX)
    const victimSeat = seats[lethalPlan.expectedDeathSeat]

    await test.step(`NIGHT ${LETHAL_NIGHT_DAY_INDEX} — 보호 실패(DOCTOR가 GUARD를 지킨다)`, async () => {
      for (const seat of seats) {
        await actors.settleOverlays(seat, { expectPhase: "NIGHT" })
        await actors.waitForPhase(seat, "NIGHT", LETHAL_NIGHT_DAY_INDEX)
      }
      for (const seatPlan of lethalPlan.seats) {
        if (seatPlan.action === "NONE") continue
        const seat = seats[seatPlan.seatIndex]
        await actors.settleOverlays(seat)
        await actors.submitNightAction(
          seat,
          seatPlan.actionLabel,
          seatPlan.action === "SKIP" ? null : uuidOf(seatPlan.targetSeat),
        )
      }
    })

    await test.step(`사망 영상 재생 검증 · DAY ${FINAL_DAY_INDEX} 진입 · 사망자 표시`, async () => {
      const killMessage = expectedKillRevealMessage(victimSeat.account.nickname)
      for (const seat of seats) {
        await actors.settleOverlays(seat, { expectKillReveal: killMessage, expectPhase: "DAY" })
        await actors.waitForPhase(seat, "DAY", FINAL_DAY_INDEX)
        await expect(
          seat.page.locator(selectors.deadPlayerCard(victimSeat.account.nickname)),
          `${seat.label}: ${victimSeat.account.nickname}이(가) 사망으로 표시되지 않았습니다`,
        ).toHaveCount(1)
      }
    })

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
    })

    await test.step("재판 — 피고인 외 생존 전원 유죄 → 처형", async () => {
      for (const seatPlan of planDay(FINAL_DAY_INDEX).seats) {
        if (!seatPlan.alive || seatPlan.seatIndex === SEAT.JOKER) continue
        await actors.tribunalVoteGuilty(seats[seatPlan.seatIndex])
      }
      await actors.resolveTribunal(seats[SEAT.DOCTOR])
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
    })
  } finally {
    for (const seat of seats) await actors.closeSeat(seat)
  }
})
