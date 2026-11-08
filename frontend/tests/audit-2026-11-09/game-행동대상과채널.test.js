// 6차 묶음: 투표·밤 행동 대상(동료 광대 숨김), TARGET_IS_ALLY 문구, 역할 공개 정보, 내 생존, 채팅 채널(밤 채팅은 같은 직업끼리), 낮 채팅 방송 검사, 늦은 응답 가리기
import test from "node:test"
import assert from "node:assert/strict"

import {
  buildDayVoteTargets,
  buildNightActionTargets,
  isSessionPlayerAlive,
} from "../../src/domains/game/ingame/utils/actionTargets.js"
import {
  computeNightActionSubmitPatch,
  computeResolveNightAckPatch,
  computeResolveNightInvalidatePatch,
  shouldApplyNightBroadcastPayload,
} from "../../src/domains/game/ingame/utils/nightPatches.js"
import {
  computeRoleRevealInvalidatePatch,
  getInGameRoleRevealInfo,
  resolveInGameRoleRevealAllies,
} from "../../src/domains/game/ingame/utils/roleReveal.js"
import {
  canReadRoleNightChat,
  isJokerNightChatEligible,
  resolveInGameSelfAliveForControls,
  selectInGameSelfAlive,
} from "../../src/domains/game/ingame/utils/selfAlive.js"
import {
  resolveInGameChatReadChannels,
  resolveInGameChatSendChannel,
  resolveInGameChatViewChannel,
} from "../../src/domains/game/ingame/utils/inGameChatChannel.js"
import { parseGameChatBroadcastPayload } from "../../src/domains/game/ingame/utils/parseGameChatBroadcastPayload.js"
import { shouldAcceptGameChatMessage } from "../../src/domains/game/ingame/utils/shouldAcceptGameChatMessage.js"
import { isStaleRoleRevealAckResponse } from "../../src/domains/game/ingame/utils/staleAck.js"
import { getPlayerDisplayName } from "../../src/domains/game/ingame/utils/getPlayerDisplayName.js"

const sp = (id, status = "alive", extra = {}) => ({ id, nickname: `닉${id}`, status, ...extra })

test("낮 투표 대상: 나와 죽은 사람은 빼고, 끊긴 사람은 connected=false로 남김", () => {
  const t = buildDayVoteTargets([sp("1"), sp("2", "dead"), sp("3", "disconnected"), sp("me")], { localPlayerId: "me" })
  assert.deepEqual(t.map((x) => [x.id, x.connected]), [["1", true], ["3", false]])
  assert.ok(t.every((x) => x.alive === true))
})

test("낮 투표 대상: 배열이 아니면 빈 목록", () => {
  assert.deepEqual(buildDayVoteTargets(null), [])
})

test("살아 있음 판단: 죽음 상태만 아니면 살아 있음(끊김 포함)", () => {
  assert.equal(isSessionPlayerAlive(sp("1", "disconnected")), true)
  assert.equal(isSessionPlayerAlive(sp("1", "dead")), false)
  assert.equal(isSessionPlayerAlive(undefined), true)
})

test("밤 행동 대상: 동료 광대는 고를 수 없고 이름에 동료 표시", () => {
  const t = buildNightActionTargets([sp("1", "alive", { isAlly: true }), sp("2")], { localPlayerId: "me", role: "JOKER" })
  assert.equal(t[0].selectable, false)
  assert.equal(t[0].ally, true)
  assert.equal(t[0].name, "닉1 · 동료 JOKER")
  assert.equal(t[1].selectable, true)
  assert.equal(Object.hasOwn(t[1], "ally"), false)
})

test("밤 행동 대상: 마녀사냥꾼은 죽은 사람만, 다른 직업은 산 사람만 고름", () => {
  const list = [sp("1"), sp("2", "dead")]
  const wh = buildNightActionTargets(list, { role: "WITCH_HUNTER" })
  assert.deepEqual(wh.map((x) => x.selectable), [false, true])
  const doc = buildNightActionTargets(list, { role: "DOCTOR" })
  assert.deepEqual(doc.map((x) => x.selectable), [true, false])
})

test("밤 행동 대상: 나 자신은 허용할 때만 목록에 들어감", () => {
  const list = [sp("me"), sp("2")]
  assert.deepEqual(buildNightActionTargets(list, { localPlayerId: "me" }).map((x) => x.id), ["2"])
  assert.deepEqual(buildNightActionTargets(list, { localPlayerId: "me", selfTargetAllowed: true }).map((x) => x.id), ["me", "2"])
})

test("밤 행동 거절 TARGET_IS_ALLY: 서버 기본 문구 대신 동료 광대 문구", () => {
  assert.deepEqual(computeNightActionSubmitPatch({ ok: false, code: "TARGET_IS_ALLY", message: "거절" }), {
    status: "idle",
    error: "동료 광대는 고를 수 없습니다.",
  })
})

test("밤 행동 거절: 모르는 코드면 서버 문구, 문구도 없으면 기본 문구", () => {
  assert.equal(computeNightActionSubmitPatch({ ok: false, code: "X", message: "서버 문구" }).error, "서버 문구")
  assert.equal(computeNightActionSubmitPatch({ ok: false }).error, "제출하지 못했습니다.")
  assert.equal(computeNightActionSubmitPatch({ ok: false, code: "toString" }).error, "제출하지 못했습니다.")
  assert.deepEqual(computeNightActionSubmitPatch({ ok: true }), { status: "idle", error: null })
})

test("밤 판정 응답·무효화 조각", () => {
  assert.deepEqual(computeResolveNightAckPatch({ ok: true }), { status: "resolved", error: null })
  assert.equal(computeResolveNightAckPatch({ ok: false }).error, "판정하지 못했습니다.")
  assert.equal(computeResolveNightInvalidatePatch(false), null)
  assert.deepEqual(computeResolveNightInvalidatePatch(true), { status: "idle", error: null, nightActionResult: null })
})

test("밤 방송: 지금 판 것만 받음", () => {
  assert.equal(shouldApplyNightBroadcastPayload({ payload: { gameId: "g" }, gameId: "g" }), true)
  assert.equal(shouldApplyNightBroadcastPayload({ payload: { gameId: "h" }, gameId: "g" }), false)
  assert.equal(shouldApplyNightBroadcastPayload({ payload: { gameId: "  " }, gameId: "  " }), false)
  assert.equal(shouldApplyNightBroadcastPayload({ payload: { gameId: "g" }, gameId: null }), false)
})

const self = (extra = {}) => ({ uuid: "me", nickname: "나", role: "DOCTOR", team: "CITIZEN", ...extra })

test("역할 공개 정보: 내 계정·직업·팀이 맞으면 화면 값과 기본 스킨 그림", () => {
  const info = getInGameRoleRevealInfo(self(), { authUuid: "me" })
  assert.equal(info.roleName, "의사")
  assert.equal(info.teamLabel, "시민 진영")
  assert.equal(info.allies, null)
  assert.equal(typeof info.standingSrc, "string")
})

test("역할 공개 정보: 다른 계정·직업과 안 맞는 팀·빈 별명이면 null", () => {
  assert.equal(getInGameRoleRevealInfo(self(), { authUuid: "other" }), null)
  assert.equal(getInGameRoleRevealInfo(self({ team: "JOKER" }), { authUuid: "me" }), null)
  assert.equal(getInGameRoleRevealInfo(self({ nickname: " " }), { authUuid: "me" }), null)
  assert.equal(getInGameRoleRevealInfo(self({ role: "MAFIA" }), { authUuid: "me" }), null)
})

test("역할 공개 정보: 조커는 동료 목록이 꼭 있어야 하고 복사본으로 담김", () => {
  assert.equal(getInGameRoleRevealInfo(self({ role: "JOKER", team: "JOKER" }), { authUuid: "me" }), null)
  const allies = ["x"]
  const info = getInGameRoleRevealInfo(self({ role: "JOKER", team: "JOKER", allies }), { authUuid: "me" })
  assert.deepEqual(info.allies, ["x"])
  assert.notEqual(info.allies, allies)
  assert.equal(info.roleName, "광대")
})

test("역할 공개 동료: 판에 없는 uuid는 빼고 닉네임과 짝지음", () => {
  const r = resolveInGameRoleRevealAllies(["a", "z"], [{ uuid: "a", nickname: "가" }, { uuid: "b", nickname: "나" }])
  assert.deepEqual(r, [{ uuid: "a", nickname: "가" }])
  assert.deepEqual(resolveInGameRoleRevealAllies([], []), [])
  assert.deepEqual(resolveInGameRoleRevealAllies(["a"], null), [])
})

test("역할 공개 확인 무효화: 화면이 없으면 null", () => {
  assert.equal(computeRoleRevealInvalidatePatch(false), null)
  assert.deepEqual(computeRoleRevealInvalidatePatch(true), { status: "idle", error: null })
})

const st = (phase, role, alive) => ({ phase, self: { uuid: "me", role }, players: [{ uuid: "me", alive }] })

test("내 생존: 명단에 내가 없거나 alive가 불린이 아니면 모름(null)", () => {
  assert.equal(selectInGameSelfAlive({ self: { uuid: "me" }, players: [] }), null)
  assert.equal(selectInGameSelfAlive({ self: { uuid: "me" }, players: [{ uuid: "me", alive: 1 }] }), null)
  assert.equal(selectInGameSelfAlive(st("DAY", "DOCTOR", false)), false)
})

test("내 생존(조작 화면): 판 값이 없으면 세션 참가자 상태로 봄", () => {
  assert.equal(resolveInGameSelfAliveForControls({}, { status: "dead" }), false)
  assert.equal(resolveInGameSelfAliveForControls(st("DAY", "DOCTOR", true), { status: "dead" }), true)
})

test("밤 같은 직업 채팅 자격: 밤에 산 사람만 쓰고, 죽은 광대는 읽기만 (사용자 규칙)", () => {
  assert.equal(isJokerNightChatEligible(st("NIGHT", "JOKER", false)), false)
  assert.equal(isJokerNightChatEligible(st("NIGHT", "JOKER", true)), true)
  assert.equal(isJokerNightChatEligible(st("NIGHT", "DOCTOR", false)), false)
  assert.equal(isJokerNightChatEligible(st("DAY", "JOKER", true)), false)
  assert.equal(canReadRoleNightChat(st("NIGHT", "JOKER", false)), true)
  assert.equal(canReadRoleNightChat(st("NIGHT", "DOCTOR", false)), false)
  assert.equal(canReadRoleNightChat(st("DAY", "JOKER", false)), false)
})

test("보낼 채널: 산 사람은 낮·재판엔 낮 채널, 죽은 사람은 죽은 사람 채널 (사용자 규칙)", () => {
  assert.equal(resolveInGameChatSendChannel(st("DAY", "GUARD", true)), "DAY")
  assert.equal(resolveInGameChatSendChannel(st("TRIBUNAL", "GUARD", true)), "DAY")
  assert.equal(resolveInGameChatSendChannel(st("DAY", "GUARD", false)), "DEAD")
  assert.equal(resolveInGameChatSendChannel(st("TRIBUNAL", "GUARD", false)), "DEAD")
})

test("보낼 채널: 밤엔 같은 직업끼리(내 직업 채널), 죽으면 죽은 광대도 죽은 사람 채널 (사용자 규칙)", () => {
  assert.equal(resolveInGameChatSendChannel(st("NIGHT", "DOCTOR", true)), "DOCTOR")
  assert.equal(resolveInGameChatSendChannel(st("NIGHT", "WITCH_HUNTER", true)), "WITCH_HUNTER")
  assert.equal(resolveInGameChatSendChannel(st("NIGHT", "DOCTOR", false)), "DEAD")
  assert.equal(resolveInGameChatSendChannel(st("NIGHT", "JOKER", false)), "DEAD")
})

test("볼 채널: 죽은 사람은 죽은 사람 채널(낮 채팅도 같이 받음), 끝난 판은 살아 있을 때만 (사용자 규칙)", () => {
  assert.equal(resolveInGameChatViewChannel(st("DAY", "CITIZEN", false)), "DEAD")
  assert.equal(resolveInGameChatViewChannel(st("NIGHT", "CITIZEN", false)), "DEAD")
  assert.deepEqual(resolveInGameChatReadChannels("DEAD"), ["DEAD", "DAY"])
  assert.deepEqual(resolveInGameChatReadChannels("DAY"), ["DAY"])
  assert.deepEqual(resolveInGameChatReadChannels(null), [])
  assert.equal(resolveInGameChatViewChannel(st("ENDED", "CITIZEN", true)), "DAY")
  assert.equal(resolveInGameChatViewChannel(st("ENDED", "CITIZEN", false)), null)
  assert.equal(resolveInGameChatViewChannel({ phase: "DAY" }), null)
})

const chat = (extra = {}) => ({
  gameId: "g",
  senderUuid: "u",
  messageId: "m",
  nickname: "닉",
  sentAt: 10,
  dayIndex: 1,
  text: "안녕",
  ...extra,
})

test("낮 채팅 방송 검사: 맞는 방송은 화면 메시지 모양으로", () => {
  assert.deepEqual(parseGameChatBroadcastPayload(chat({ gameId: " g " })), {
    gameId: "g",
    id: "m",
    senderUuid: "u",
    nickname: "닉",
    text: "안녕",
    sentAt: 10,
    dayIndex: 1,
  })
})

test("낮 채팅 방송 검사: 다듬으면 달라지는 글(앞뒤 공백)·금지 문자·빈 별명은 거절", () => {
  assert.equal(parseGameChatBroadcastPayload(chat({ text: " 안녕" })), null)
  assert.equal(parseGameChatBroadcastPayload(chat({ text: "a‮b" })), null)
  assert.equal(parseGameChatBroadcastPayload(chat({ nickname: "  " })), null)
  assert.equal(parseGameChatBroadcastPayload(chat({ sentAt: -1 })), null)
  assert.equal(parseGameChatBroadcastPayload(chat({ dayIndex: 1.5 })), null)
})

test("낮 채팅 받기: 로그인·지금 판·지금 보는 채널일 때만", () => {
  const ok = { messageChannel: "DAY", messageGameId: "g", currentGameId: "g", currentAuthUuid: "a", currentViewChannel: "DAY" }
  assert.equal(shouldAcceptGameChatMessage(ok), true)
  assert.equal(shouldAcceptGameChatMessage({ ...ok, currentAuthUuid: "" }), false)
  assert.equal(shouldAcceptGameChatMessage({ ...ok, messageGameId: "h" }), false)
  assert.equal(shouldAcceptGameChatMessage({ ...ok, messageChannel: "DEAD" }), false)
  assert.equal(shouldAcceptGameChatMessage({ ...ok, currentViewChannel: null }), false)
  // 죽은 사람: 죽은 사람 채널 + 낮 채널 받음 (사용자 규칙)
  const dead = { ...ok, currentViewChannel: "DEAD", currentReadChannels: ["DEAD", "DAY"] }
  assert.equal(shouldAcceptGameChatMessage({ ...dead, messageChannel: "DEAD" }), true)
  assert.equal(shouldAcceptGameChatMessage({ ...dead, messageChannel: "DAY" }), true)
  assert.equal(shouldAcceptGameChatMessage({ ...dead, messageChannel: "JOKER" }), false)
})

test("늦은 응답 가리기: 소켓이 끊겼거나 바뀌었거나 판이 바뀌면 늦은 응답", () => {
  const sock = { connected: true }
  const ok = { mounted: true, requestVersion: 1, currentVersion: 1, requestSocket: sock, currentSocket: sock, requestGameId: "g", currentGameId: "g" }
  assert.equal(isStaleRoleRevealAckResponse(ok), false)
  assert.equal(isStaleRoleRevealAckResponse({ ...ok, requestSocket: { connected: false }, currentSocket: undefined }), true)
  assert.equal(isStaleRoleRevealAckResponse({ ...ok, currentSocket: { connected: true } }), true)
  assert.equal(isStaleRoleRevealAckResponse({ ...ok, currentGameId: "h" }), true)
  assert.equal(isStaleRoleRevealAckResponse({ ...ok, currentVersion: 2 }), true)
  assert.equal(isStaleRoleRevealAckResponse({ ...ok, mounted: false }), true)
})

test("늦은 응답 가리기: 같은 소켓이라도 연결이 끊긴 상태면 늦은 응답(FE-001 다시 붙기 전)", () => {
  const sock = { connected: false }
  assert.equal(
    isStaleRoleRevealAckResponse({ mounted: true, requestVersion: 1, currentVersion: 1, requestSocket: sock, currentSocket: sock, requestGameId: "g", currentGameId: "g" }),
    true,
  )
})

test("참가자 화면 이름: uuid 없음·명단에 없음 구분", () => {
  assert.equal(getPlayerDisplayName([{ uuid: "a", nickname: "가" }], "a"), "가")
  assert.equal(getPlayerDisplayName([], "z"), "알 수 없는 참가자")
  assert.equal(getPlayerDisplayName([], null), "없음")
})
