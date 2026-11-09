'use strict';

// 기다리기 파일, 몇 ms 쉬기·조건 될 때까지 기다리기 (시험 도우미마다 따로 만들던 sleep 한곳으로)
// helpers/·tests 폴더 도우미가 씀
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// fn이 참 될 때까지 0.2초마다 다시, 시간 넘으면 label로 던짐
async function waitUntil(fn, { timeoutMs, label }) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await fn()) return;
        await sleep(200);
    }
    throw new Error(`${label} (${timeoutMs}ms)`);
}

module.exports = { sleep, waitUntil };
