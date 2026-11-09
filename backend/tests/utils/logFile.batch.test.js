// 로그 파일 모아 쓰기 시험 (부하 줄이기 2026-11-09, docs/부하시험.md 11번)
// 줄마다 쓰지 않고 모아 한 번에 · 끌 때 남은 줄 다 씀 · 못 열면 줄마다 다시 열지 않음 · 가리기 미리 보기가 빠뜨리는 것 없음
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createLogFile, maskSecrets, REOPEN_DELAY_MS } = require('../../utils/logFile')

const tmpDir = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-logb-'))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    return dir
}

// 가짜 타이머 (부르면 그때 씀)
const fakeTimers = () => {
    const timers = []
    return {
        setTimeoutFn: (fn) => { const timer = { fn, cleared: false }; timers.push(timer); return timer },
        clearTimeoutFn: (timer) => { if (timer) timer.cleared = true },
        fire: () => timers.filter((x) => !x.cleared).forEach((x) => { x.cleared = true; x.fn() }),
        timers,
    }
}

test('모아 쓰기: 여러 줄을 타이머 한 번에 같이 씀 (줄마다 쓰기 X)', (t) => {
    const dir = tmpDir(t)
    const timers = fakeTimers()
    const writes = t.mock.method(fs, 'writeSync')
    const log = createLogFile({ dir, now: () => new Date(2026, 10, 9, 12), ...timers })
    for (let i = 0; i < 50; i += 1) log.write(`줄 ${i}`)
    assert.equal(writes.mock.callCount(), 0, '타이머 전엔 안 씀')
    assert.equal(timers.timers.length, 1, '타이머는 하나만')
    timers.fire()
    assert.equal(writes.mock.callCount(), 1, '50줄을 한 번에')
    writes.mock.restore()
    log.close()
    const text = fs.readFileSync(path.join(dir, 'app-2026-11-09.log'), 'utf8')
    assert.equal(text.trim().split('\n').length, 50)
    assert.match(text, /줄 0\n[\s\S]*줄 49\n$/)
})

test('모아 쓰기: close()가 타이머 전 남은 줄도 다 쓰고 닫음 (끄기·예상 못 한 오류 길)', (t) => {
    const dir = tmpDir(t)
    const timers = fakeTimers()
    const log = createLogFile({ dir, now: () => new Date(2026, 10, 9, 12), ...timers })
    log.write('[SHUTDOWN] 시작')
    log.write('[SHUTDOWN] 끝')
    log.close()
    const text = fs.readFileSync(path.join(dir, 'app-2026-11-09.log'), 'utf8')
    assert.match(text, /시작\n.*끝\n$/)
})

test('못 열면: 줄마다 다시 열지 않고 정한 시간 뒤에 한 번 다시 열어 봄, 알림은 표준 오류로', (t) => {
    const dir = tmpDir(t)
    let clock = new Date(2026, 10, 9, 12).getTime()
    const reports = []
    const realOpen = fs.openSync
    let failOpen = true
    const opens = t.mock.method(fs, 'openSync', (...args) => {
        if (failOpen) { const e = new Error('denied'); e.code = 'EACCES'; throw e }
        return realOpen(...args)
    })
    const log = createLogFile({ dir, now: () => new Date(clock), reportError: (m) => reports.push(m), ...fakeTimers() })
    for (let i = 0; i < 100; i += 1) log.write(`줄 ${i}`)
    assert.equal(opens.mock.callCount(), 1, '100줄에 열기 시도 1번')
    assert.equal(reports.length, 1)
    assert.match(reports[0], /EACCES/)

    failOpen = false
    clock += REOPEN_DELAY_MS
    log.write('다시 열린 뒤 줄')
    assert.equal(opens.mock.callCount(), 2)
    opens.mock.restore()
    log.close()
    const text = fs.readFileSync(path.join(dir, 'app-2026-11-09.log'), 'utf8')
    assert.match(text, /다시 열린 뒤 줄\n$/)
    assert.doesNotMatch(text, /줄 0/)
})

test('가리기: 미리 보기에 안 걸리는 줄은 그대로, 걸리는 낱말 모양은 대소문자 섞여도 다 가림', () => {
    assert.equal(maskSecrets('GET /game/snapshot 200 3.1 ms'), 'GET /game/snapshot 200 3.1 ms')
    const cases = [
        ['PASSWORD=abc1', 'abc1'], ['Token: t0k', 't0k'], ['x-internal-key=kk9', 'kk9'], ['API_KEY=zz8', 'zz8'],
        ['Set-Cookie: accessToken=ck7', 'ck7'], ['authorization: Bearer bb6', 'bb6'], ['redis://u:pw5@h:1', 'pw5'],
        ['jwt eyJa.eyJb.sig4', 'eyJa'], ['{"pwd":"pp3"}', 'pp3'], ['Secret=ss2', 'ss2'],
    ]
    for (const [line, secret] of cases) assert.ok(!maskSecrets(line).includes(secret), `가려지지 않음: ${line}`)
})
