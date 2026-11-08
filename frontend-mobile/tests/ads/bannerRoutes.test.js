// 화면별 하단 배너 보임 여부 시험
import { test } from "node:test"
import assert from "node:assert/strict"
import { shouldShowBanner } from "../../src/shared/ads/bannerRoutes.js"

test("게임 바깥 화면은 배너 보임", () => {
    for (const path of [
        "/lobby", "/gameMode", "/multiplay", "/roomInvite", "/game-setup", "/game-matching",
        "/mypage", "/mypage/emoticons", "/account", "/store", "/library", "/setting", "/gameresult",
    ]) {
        assert.equal(shouldShowBanner(path), true, path)
    }
})

test("인게임·로그인·가입·계정 찾기·개발 미리보기는 배너 없음", () => {
    for (const path of [
        "/ingame", "/", "/login", "/find-id", "/password-reset", "/password-reset/request",
        "/dev/tribunal-presentation", "/podium", "/없는화면",
    ]) {
        assert.equal(shouldShowBanner(path), false, path)
    }
})

test("끝 빗금은 같은 주소, 이상한 값은 false", () => {
    assert.equal(shouldShowBanner("/lobby/"), true)
    assert.equal(shouldShowBanner("/ingame/"), false)
    assert.equal(shouldShowBanner(""), false)
    assert.equal(shouldShowBanner(undefined), false)
})
