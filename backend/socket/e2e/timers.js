'use strict';

// 브라우저 시험용 타이머 장부 파일, 판 단계 타이머를 기억해 두고 시험이 "지금 끝내기"로 바로 돌릴 수 있게 함
// gameSession/core/timers.js가 E2E_HOOKS 켜졌을 때만 이 setTimeout·clearTimeout을 run에 넣음, e2e/gameHooks.js가 바로 돌림

// 타이머 손잡이 → 돌릴 함수 (돌았거나 꺼진 건 빠짐)
const pendingTimers = new Map();

// 진짜 setTimeout 그대로 + 장부에 적기 (돌면 장부에서 빠짐)
function trackedSetTimeout(fn, delayMs) {
    const handle = setTimeout(() => {
        pendingTimers.delete(handle);
        fn();
    }, delayMs);
    pendingTimers.set(handle, fn);
    return handle;
}

// 진짜 clearTimeout 그대로 + 장부에서 빼기
function trackedClearTimeout(handle) {
    pendingTimers.delete(handle);
    clearTimeout(handle);
}

// 아직 안 돈 타이머인지
function isPending(handle) {
    return handle !== null && handle !== undefined && pendingTimers.has(handle);
}

// 지금 바로 돌리기: 원래 타이머 끄고 함수 한 번 (없으면 false)
function fireNow(handle) {
    const fn = pendingTimers.get(handle);
    if (!fn) return false;
    trackedClearTimeout(handle);
    fn();
    return true;
}

module.exports = { trackedSetTimeout, trackedClearTimeout, isPending, fireNow };
