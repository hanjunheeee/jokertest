#!/usr/bin/env node
'use strict';

// 눈 확인 도구 본체, 장면을 차례로 준비해 창을 띄운 채 멈추고 "다음" 신호가 오면 미리 준비해 둔 다음 장면을 보여 줌
// run.sh가 잠금을 잡고 부름 — 쓰는 법은 읽어보기.md, 지금 상태는 .run/eyecheck/status.json
process.env.E2E_RUN_ID = process.env.E2E_RUN_ID || `eye${Date.now().toString(36)}`;

const fs = require('node:fs');
const path = require('node:path');
const P = require('./lib/paths');
const { Servers } = require('./lib/servers');
const { Windows } = require('./lib/windows');
const { Session } = require('./lib/session');
const { Signals } = require('./lib/signals');
const { loadScenes } = require('./lib/scenes');

fs.mkdirSync(P.SHOTS_DIR, { recursive: true });

// 인자: [시작 번호] [--selfcheck] [--only 가,바-01] [--scenes-dir 폴더] [--no-prefetch]
function parseArgs(argv) {
    const o = { start: null, selfcheck: false, only: [], dirs: [path.join(P.TOOL_DIR, 'scenes')], prefetch: true };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--selfcheck') o.selfcheck = true;
        else if (a === '--no-prefetch') o.prefetch = false;
        else if (a === '--only') o.only = String(argv[++i] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        else if (a === '--scenes-dir') o.dirs.push(path.resolve(argv[++i]));
        else if (!a.startsWith('--')) o.start = a;
        else throw new Error(`모르는 인자: ${a}`);
    }
    return o;
}

const opts = parseArgs(process.argv.slice(2));
const stamp = () => new Date().toTimeString().slice(0, 8);
function log(text) {
    const line = `[${stamp()}] ${text}`;
    console.log(line);
    fs.appendFileSync(P.LOG_FILE, `${line}\n`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firstLine = (e) => String(e?.message ?? e).split('\n')[0].slice(0, 300);

// 정한 시간 안에 안 끝나면 실패로 침 (멈춘 준비가 도구 전체를 붙잡지 않게)
function withTimeout(promise, ms, what) {
    let timer;
    return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} ${Math.round(ms / 1000)}초 넘김`)), ms); }),
    ]);
}

const scenes = loadScenes({ dirs: opts.dirs, only: opts.only });
if (scenes.length === 0) { console.error('장면 없음 (--only 값 확인)'); process.exit(2); }
const indexOf = (id) => scenes.findIndex((sc) => sc.id === id);

const servers = new Servers({ runId: process.env.E2E_RUN_ID, log });
const windows = new Windows({ headless: opts.selfcheck });

// 장면 준비 → rec = { index, scene, s, state: '준비 중'|'준비됨'|'손으로'|'실패', error, prepareMs, promise }
function prepare(index, { session = null, hidden = false } = {}) {
    const scene = scenes[index];
    const s = session ?? new Session({ windows, scene, hidden, log });
    if (session) { s.scene = scene; s.chained = true; s.notes = []; s.alerts = []; }
    const rec = { index, scene, s, state: '준비 중', error: null, prepareMs: null, startedAt: Date.now() };
    rec.promise = (async () => {
        try {
            for (const name of scene.needs ?? []) await servers.ensure(name);
            if (scene.prepare) await withTimeout(Promise.resolve().then(() => scene.prepare(s)), scene.timeoutMs ?? 240_000, `${scene.id} 준비`);
            rec.state = scene.manual ? '손으로' : '준비됨';
        } catch (error) {
            rec.state = '실패';
            rec.error = firstLine(error);
            log(`[${scene.id}] 준비 실패: ${rec.error}`);
        }
        rec.prepareMs = Date.now() - rec.startedAt;
        return rec;
    })();
    return rec;
}

// 보여 줄 때 할 일: 창 늘어놓기 → 장면의 show (시작 직후가 중요한 장면용, 예: 판 시작)
async function reveal(rec) {
    rec.overlap = await rec.s.show().catch(() => 0);
    if (rec.state === '실패' || !rec.scene.show) return;
    try {
        await withTimeout(Promise.resolve().then(() => rec.scene.show(rec.s)), rec.scene.showTimeoutMs ?? 60_000, `${rec.scene.id} 보여 주기`);
    } catch (error) {
        rec.state = '실패';
        rec.error = firstLine(error);
        log(`[${rec.scene.id}] 보여 주기 실패: ${rec.error}`);
    }
}

// 다음 장면이 지금 판을 이어 받나 (같은 chain, 바로 다음 번호)
const continues = (from, toIndex) => Boolean(from && scenes[toIndex]?.chain && scenes[toIndex].chain === from.scene.chain
    && toIndex === from.index + 1 && !from.s.closed);

// 상태 파일 (반장이 읽어 사용자에게 알림)
const run = { current: null, prefetch: null, last: null, mode: opts.selfcheck ? 'selfcheck' : '창 보임' };
const sceneInfo = (rec) => rec && ({
    id: rec.scene.id, where: rec.scene.where ?? null, how: rec.scene.how ?? null, look: rec.scene.look ?? null,
    manual: rec.scene.manual ?? null, state: rec.state, ready: rec.state === '준비됨' || rec.state === '손으로',
    error: rec.error, notes: rec.s?.notes ?? [], alerts: rec.s?.alerts ?? [], prepareMs: rec.prepareMs, still: rec.still ?? null,
    windows: rec.s?.people.map((p) => `${p.label}${p.account ? ` (${p.account.nickname})` : ''}`) ?? [], overlap: rec.overlap ?? 0,
});
function writeStatus() {
    const cur = run.current;
    const next = run.prefetch;
    let nextInfo = null;
    if (next) nextInfo = { id: next.scene.id, state: next.state, ready: next.state !== '준비 중' };
    else if (cur && continues(cur, cur.index + 1)) nextInfo = { id: scenes[cur.index + 1].id, state: '같은 판 이어서 (다음 신호 때 굴림)', ready: false };
    const status = {
        mode: run.mode,
        runId: process.env.E2E_RUN_ID,
        index: cur ? cur.index + 1 : 0,
        total: scenes.length,
        left: cur ? scenes.length - cur.index - 1 : scenes.length,
        now: sceneInfo(cur),
        next: nextInfo,
        lastSwitch: run.last,
        signals: '터미널 Enter / 파일 tools/시험도구/.run/eyecheck/next (빈 글=다음, prev, goto 바-07, again, stop)',
        updatedAt: new Date().toISOString(),
    };
    const tmp = `${P.STATUS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(status, null, 1));
    fs.renameSync(tmp, P.STATUS_FILE);
}

// 미리 준비: 한 장면 앞까지만, 같은 판을 이어 받는 장면은 안 함
function startPrefetch(index) {
    if (!opts.prefetch || index >= scenes.length || continues(run.current, index)) return;
    if (run.prefetch?.index === index) return;
    dropPrefetch();
    const rec = prepare(index, { hidden: true });
    run.prefetch = rec;
    rec.promise.then(() => { log(`[${rec.scene.id}] 미리 준비 ${rec.state} (${(rec.prepareMs / 1000).toFixed(1)}초)`); writeStatus(); });
    writeStatus();
}
function dropPrefetch() {
    const rec = run.prefetch;
    run.prefetch = null;
    if (rec) rec.promise.then(() => rec.s.close());
}

// 장면 바꾸기 (how: start·next·prev·goto·again)
async function activate(target, how) {
    const t0 = Date.now();
    const old = run.current;
    let rec;
    let kind;
    if (how !== 'again' && continues(old, target)) {
        kind = '같은 판 이어서';
        rec = prepare(target, { session: old.s });
        run.current = rec; writeStatus();
        await rec.promise;
    } else if (how !== 'again' && run.prefetch?.index === target) {
        kind = run.prefetch.state === '준비 중' ? '미리 준비 중이던 것 기다림' : '미리 준비됨';
        rec = run.prefetch;
        run.prefetch = null;
        await rec.promise;
    } else {
        kind = '새로 준비';
        dropPrefetch();
        // 지난 창을 먼저 닫음 (CPU 아끼기)
        if (old) await old.s.close();
        rec = prepare(target);
        run.current = rec; writeStatus();
        await rec.promise;
    }
    await reveal(rec);
    if (old && old.s !== rec.s) await old.s.close();
    run.current = rec;
    const ms = Date.now() - t0;
    run.last = { from: old?.scene.id ?? null, to: rec.scene.id, how, kind, ms, people: rec.s.people.length };
    fs.appendFileSync(P.TIMES_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...run.last })}\n`);
    log(`▶ ${rec.scene.id} [${rec.state}] ${kind} ${(ms / 1000).toFixed(1)}초 — 볼 것: ${rec.scene.look ?? '(글 없음)'}`);
    if (rec.error) log(`   까닭: ${rec.error}`);
    if (rec.scene.manual) log(`   손으로: ${rec.scene.manual}`);
    for (const n of rec.s.notes) log(`   참고: ${n}`);
    writeStatus();
    startPrefetch(target + 1);
}

// 지금 장면이 아직 그 자리에 서 있나 (장면의 still 함수, 5초마다)
async function watchStill() {
    for (;;) {
        await sleep(5000);
        const rec = run.current;
        if (!rec || !rec.scene.still || rec.state !== '준비됨' || rec.s.closed) continue;
        const ok = await Promise.resolve().then(() => rec.scene.still(rec.s)).catch(() => false);
        const before = rec.still;
        rec.still = ok ? '그대로' : '지나감 (again으로 다시 준비)';
        if (before !== rec.still) { log(`[${rec.scene.id}] ${rec.still}`); writeStatus(); }
    }
}

// 창 보이는 모드: 신호를 하나씩 받아 장면을 바꿈
async function interactive(signals) {
    let target = opts.start ? indexOf(opts.start) : 0;
    if (target < 0) throw new Error(`없는 번호: ${opts.start}`);
    await activate(target, 'start');
    watchStill();
    for (;;) {
        const cmd = await signals.next();
        log(`신호 (${cmd.from}): ${cmd.type}${cmd.id ? ` ${cmd.id}` : ''}`);
        if (cmd.type === 'stop') return;
        const cur = run.current.index;
        if (cmd.type === 'next') target = cur + 1;
        else if (cmd.type === 'prev') target = cur - 1;
        else if (cmd.type === 'again') target = cur;
        else if (cmd.type === 'goto') target = indexOf(cmd.id);
        if (target < 0 || target >= scenes.length) {
            log(cmd.type === 'goto' ? `없는 번호: ${cmd.id}` : '더 갈 장면 없음 (끝내려면 stop)');
            continue;
        }
        await activate(target, cmd.type);
    }
}

// 스스로 확인 (창 없음): 장면마다 준비 → 사진 → 닫기, 같은 판 장면은 이어서
async function selfcheck() {
    const results = [];
    let prev = null;
    // 지난번 사진이 섞이지 않게 비우고 시작
    for (const name of fs.readdirSync(P.SHOTS_DIR)) fs.rmSync(path.join(P.SHOTS_DIR, name), { force: true });
    for (let i = 0; i < scenes.length; i += 1) {
        const reuse = continues(prev, i);
        if (prev && !reuse) await prev.s.close();
        const rec = prepare(i, reuse ? { session: prev.s } : {});
        run.current = rec; writeStatus();
        await rec.promise;
        await reveal(rec);
        await sleep(rec.scene.settleMs ?? 1500);
        const shots = [];
        for (let k = 0; k < rec.s.people.length; k += 1) {
            const name = k === 0 ? `${rec.scene.id}.png` : `${rec.scene.id}-${k + 1}.png`;
            const err = await rec.s.people[k].page.screenshot({ path: path.join(P.SHOTS_DIR, name), timeout: 15_000 }).then(() => null, (e) => firstLine(e));
            if (err) log(`[${rec.scene.id}] 사진 못 찍음 ${name}: ${err}`); else shots.push(name);
        }
        const row = { id: rec.scene.id, state: rec.state, error: rec.error, ms: rec.prepareMs, chained: reuse, shots, alerts: rec.s.alerts, notes: rec.s.notes, manual: rec.scene.manual ?? null };
        results.push(row);
        log(`[${row.id}] ${row.state} ${(row.ms / 1000).toFixed(1)}초${reuse ? ' (같은 판 이어서)' : ''}${row.error ? ` — ${row.error}` : ''}${shots.length ? ` 사진 ${shots.join(', ')}` : ''}`);
        prev = rec;
    }
    if (prev) await prev.s.close();
    fs.writeFileSync(path.join(P.RUN_DIR, 'selfcheck.json'), JSON.stringify(results, null, 1));
    const failed = results.filter((r) => r.state === '실패');
    const count = (st) => results.filter((r) => r.state === st).length;
    log(`스스로 확인 끝: 준비됨 ${count('준비됨')} · 손으로 ${count('손으로')} · 실패 ${failed.length} / ${results.length}`);
    for (const r of failed) log(`  실패 ${r.id}: ${r.error}`);
    return failed.length;
}

// 끝내기: 창·봇 → 이번 계정 지우기 → 내가 켠 서버 끄기 (한 번만)
let finishing = null;
function finish(signals) {
    if (finishing) return finishing;
    finishing = (async () => {
        signals?.stop();
        log('끝내는 중: 창·봇 닫기 → 이번 계정 지우기 → 서버 끄기');
        dropPrefetch();
        await run.current?.s.close().catch(() => {});
        await windows.close();
        try { await P.fromE2e('helpers/global-teardown')(); } catch (error) { log(`계정 지우기 실패 (다음 e2e 실행 시작 정리가 지움): ${firstLine(error)}`); }
        servers.stopAll();
        run.current = null; run.prefetch = null; run.mode = '끝남';
        writeStatus();
    })();
    return finishing;
}

async function main() {
    fs.writeFileSync(P.LOG_FILE, '');
    fs.writeFileSync(P.TIMES_FILE, '');
    log(`눈 확인 시작: ${run.mode}, 장면 ${scenes.length}개 (${scenes[0].id} ~ ${scenes[scenes.length - 1].id}), 실행 번호 ${process.env.E2E_RUN_ID}`);
    Servers.cleanStale(log);
    writeStatus();
    const signals = opts.selfcheck ? null : new Signals({ log });
    let stops = 0;
    const onSignal = () => {
        stops += 1;
        if (stops === 1 && signals) { signals.push({ type: 'stop' }, '끊기'); return; }
        finish(signals).finally(() => process.exit(130));
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    let code = 0;
    try {
        await servers.ensure('backend');
        // e2e 실행 시작 정리와 같은 것: 바깥 막기 확인 + 6시간 넘은 시험 계정만 지움
        await P.fromE2e('helpers/global-setup')();
        if (opts.selfcheck) {
            code = (await selfcheck()) > 0 ? 1 : 0;
        } else {
            signals.start();
            log('신호: 터미널 Enter=다음 / 파일 .run/eyecheck/next에 빈 글·prev·goto <번호>·again·stop');
            await interactive(signals);
        }
    } catch (error) {
        log(`멈춤: ${firstLine(error)}`);
        code = 1;
    } finally {
        await finish(signals);
    }
    process.exit(code);
}

main();
