# F-21 시험 대기 결함과 BF 재개 경로 — 2026-09-18

## 관찰 (Pluto가 실행한 F-21 시험, BF 워크트리 `765bf674`)

`backend/tests/db/f21-participant-departure.integration.test.js`의 실패 3건은 모두 같은 대기 함수에서 난다.

```js
async function waitForPersistSettled({ tries = 200 } = {}) {
    for (let i = 0; i < tries; i += 1) {
        if (__getTerminalPersistRunsForTests().length === 0) { await new Promise(r => setImmediate(r)); return true; }
        await new Promise((resolve) => setImmediate(resolve));
    }
    return false;
}
```

- setImmediate 200번은 실제 시간으로 몇 ms다. 실제 MySQL 트랜잭션은 그보다 오래 걸린다.
- 그래서 "저장이 끝나지 않았다"로 실패 판정을 낸 **뒤에** 로그에 DB 저장과 COMMIT이 이어진다.
- 저장 경로(`attemptTerminalPersist`)는 fire-and-forget이고 run 객체에 pending Promise를 노출하지 않으므로, 시험은 `terminalPersistRuns`가 비는 것을 **시간 기준**으로 기다려야 한다.

## 판단

- 시험 코드 결함이다. 추방 후 저장·보상 기능이 고장났다고 확정된 것은 아니다. 대기 방식을 고친 뒤 같은 3건을 다시 돌려 봐야 기능 정상 여부를 말할 수 있다.
- 수정은 F-21 슬라이스 범위(시험 파일)이고, 모니터가 직접 고치지 않고 Pluto의 공식 재시도(사유 포함)로 넣는다.

## 제안 수정 (재시도 힌트로 전달)

```js
/** 저장은 fire-and-forget이다 — 그 gameId의 작업이 실제로 끝날 때까지 **실제 시간**으로 기다린다. */
async function waitForPersistSettled({ timeoutMs = 15_000, stepMs = 10 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (__getTerminalPersistRunsForTests().length === 0) {
            await new Promise((resolve) => setImmediate(resolve));
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
    return false;
}
```

- 재시도 지연(1s·5s·30s)이 걸린 실패 저장은 15초 안에 끝나지 않을 수 있다. 그 경우 false는 "실제로 안 끝났다"라 시험 실패가 옳다.
- 이 함수를 쓰는 단언 6곳(307·316·439·483·510행 등)은 그대로 둔다.

## BF 재개 경로 (Pluto 10차)

- BF는 retry 8이라 새 절대 상한 6에 막혔다. 새 규칙 아래서는 회차가 정확히 6에서 서므로 `retry > 6`은 규칙 이전의 옛 회차뿐이다. `humanRetryPermit`이 옛 회차는 사유(10자 이상)가 있으면 재개를 허용하고, 힌트 맨 위에 `[절대 상한 6 이전의 옛 회차 8 — 사람 사유로 재개]`를 남긴다. 사유 없으면 거절.
- 재개 명령(데몬을 올린 뒤):

```bash
node C:/dev/pluto/packages/daemon/dist/src/cli.js call C:/Users/minsa/jokertest pluto/slices/retry '{"id":"BF","reason":"backend/tests/db/f21-participant-departure.integration.test.js의 waitForPersistSettled가 setImmediate 200회만 돌아 실제 DB 커밋(수십 ms 이상)을 기다리지 못한다. 실패 판정 뒤 로그에 저장·COMMIT이 이어진다. 시간 기준 대기(기본 15초, 10ms 간격)로 바꾸고 같은 3건을 다시 돌려라. 저장 경로(attemptTerminalPersist)는 건드리지 마라."}'
```

- 되감기 8회차는 `resumeSession` 대상(1·2회차)이 아니므로 새 세션이 파일 인계로 시작한다. 심사는 `reviewedCommit=765bf674` 기준 delta다.
- 이 라운드가 끝나면 BF는 분할 후보다. 회차가 9회면 규칙의 취지대로 더 돌리지 않는다.
