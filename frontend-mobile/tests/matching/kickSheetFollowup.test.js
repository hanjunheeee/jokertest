// 대기방 추방 창 후속 시험: 실패 코드는 쉬운 글로, 대상 줄 사진은 그 사람 사진
import "../helpers/mobileLoader.mjs"
import { React, render } from "../helpers/dom.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"

const { default: KickStatus } = await import("@m/domains/game/matching/components/kick/KickStatus.jsx")
const { default: KickSheet } = await import("@m/domains/game/matching/components/kick/KickSheet.jsx")
const { KICK_REQUEST_STATUS } = await import("@/domains/game/ingame/constants/ingameKick.js")
const { resolvePlayerRecordListProfileAssets, getPlayerRecordListFallbackProfileAssets } =
    await import("@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js")

test("추방 실패: 코드(ALREADY_LEFT) 대신 안내 글, 모르는 코드는 기본 글", () => {
    const view = render(React.createElement(KickStatus, { targets: [], status: KICK_REQUEST_STATUS.FAILED, errorCode: "ALREADY_LEFT" }))
    const error = view.container.querySelector('[data-testid="kick-error"]')
    assert.equal(error.textContent, "이미 게임을 떠난 플레이어입니다.")
    view.rerender(React.createElement(KickStatus, { targets: [], status: KICK_REQUEST_STATUS.FAILED, errorCode: "WHAT_IS_THIS" }))
    const fallback = view.container.querySelector('[data-testid="kick-error"]').textContent
    assert.notEqual(fallback, "WHAT_IS_THIS")
    assert.ok(fallback.length > 0)
    view.unmount()
})

test("추방 대상 줄: 계정 사진이 있으면 줄 순서 기본 그림이 아니라 그 사람 사진", () => {
    const player = { uuid: "u-1", membershipId: "m-1", nickname: "가", portraitSrc: "/test/내사진.png" }
    const expected = resolvePlayerRecordListProfileAssets(player, 0)
    const page = { kickModalOpen: true, closeKickModal: () => {}, kickTargets: [player], kickPendingTarget: null, kickStatus: null, isKicking: false }
    const view = render(React.createElement(KickSheet, { page }))
    const srcs = [...document.querySelectorAll('[data-testid="kick-sheet"] img')].map((img) => decodeURI(img.getAttribute("src") ?? ""))
    assert.equal(expected.profilePhotoSrc, "/test/내사진.png")
    assert.ok(srcs.some((src) => src.endsWith("/test/내사진.png")), srcs.join(","))
    const fallback = decodeURI(getPlayerRecordListFallbackProfileAssets(0).profilePhotoSrc)
    assert.equal(srcs.some((src) => src.endsWith(fallback)), false)
    view.unmount()
})
