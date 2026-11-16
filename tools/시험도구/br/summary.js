// 브라우저 시험 결과 JSON 정리 파일, 단계 하나의 숫자·실패 목록·다시 돌릴 목록을 만들고 단계 전부를 한 표로 묶음
// once.sh가 단계마다 부름 — 쓰는 법은 docs/게임_의도_2026-11-15/브라우저_실행_준비.md
//   node summary.js <단계.json> <단계 이름>  → 같은 폴더에 <이름>.counts · <이름>.failed.tsv · <이름>.list, 화면엔 한 줄 요약
//   node summary.js --merge <결과 폴더>      → 단계별 표 + 합계 + failed-all.tsv(분류 칸 비움, 다시 돌린 결과 붙임)
// 시험 결과만 읽음 (시험 다시 돌리기·지우기 없음)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// 색 글자 지우기·한 줄로
const firstLine = (text) => String(text ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? '';
const clean = (text) => String(text ?? '').replace(/[\t\r\n]+/g, ' ').slice(0, 240);
// 시험 이름 앞 목록 번호 (예: A05-E-592)
const idOf = (title) => (String(title).match(/\b(A\d{2}[a-z]?-[A-Z]-\d{3,4})\b/) ?? [])[1] ?? '-';
const norm = (p) => String(p).split(path.sep).join('/');

/** 결과 JSON 한 개 → 시험 줄 목록 [{ project, file, line, titles, status, result }] */
function readTests(file) {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = [];
    const walk = (suite, titles) => {
        for (const spec of suite.specs ?? []) {
            for (const t of spec.tests ?? []) {
                const last = t.results?.[t.results.length - 1] ?? {};
                out.push({ project: t.projectName, file: norm(spec.file), line: spec.line, titles: [...titles, spec.title], status: t.status, result: last });
            }
        }
        // 파일 묶음(이름이 파일)은 제목에 안 넣음, describe 묶음만 넣음 (--test-list 모양과 같게)
        for (const child of suite.suites ?? []) walk(child, child.title && !/\.spec\.[cm]?js$/.test(child.title) ? [...titles, child.title] : titles);
    };
    for (const suite of report.suites ?? []) walk(suite, []);
    return { report, tests: out };
}

const keyOf = (t) => `${t.project}|${t.file}|${t.titles.join(' › ')}`;
const isFail = (t) => t.status === 'unexpected';

/** 단계 하나 정리 */
function one(file, name) {
    const dir = path.dirname(file);
    if (!fs.existsSync(file)) { console.log(`[${name}] 결과 JSON 없음 (시작 못 함 또는 도중에 멈춤) → ${name}.log 끝을 볼 것`); fs.writeFileSync(path.join(dir, `${name}.counts`), '0 0 0 0 0 0\n'); return; }
    const { report, tests } = readTests(file);
    const n = { total: tests.length, passed: 0, failed: 0, skipped: 0, flaky: 0, interrupted: 0 };
    for (const t of tests) {
        if (t.status === 'expected') n.passed += 1;
        else if (t.status === 'skipped') { if (t.result.status === 'interrupted') n.interrupted += 1; else n.skipped += 1; }
        else if (t.status === 'flaky') n.flaky += 1;
        else n.failed += 1;
    }
    const fails = tests.filter(isFail);
    // 숫자 한 줄 (셸이 read로 읽음): 전체 통과 실패 건너뜀 흔들림 끊김
    fs.writeFileSync(path.join(dir, `${name}.counts`), `${n.total} ${n.passed} ${n.failed} ${n.skipped} ${n.flaky} ${n.interrupted}\n`);
    // 실패 목록: 번호 프로젝트 파일:줄 상태 오류 첫 줄 기록물
    const rows = fails.map((t) => {
        const err = firstLine(t.result.errors?.[0]?.message ?? t.result.error?.message ?? t.result.status);
        const art = (t.result.attachments ?? []).filter((a) => a.path).map((a) => norm(path.relative(dir, a.path)))[0] ?? '';
        return [idOf(t.titles[t.titles.length - 1]), t.project, `${t.file}:${t.line}`, t.result.status ?? '', clean(err), art].join('\t');
    });
    fs.writeFileSync(path.join(dir, `${name}.failed.tsv`), rows.length ? `${rows.join('\n')}\n` : '');
    // 다시 돌릴 목록 (--test-list 모양: [프로젝트] › 파일 › 제목…)
    fs.writeFileSync(path.join(dir, `${name}.list`), fails.map((t) => `[${t.project}] › ${t.file} › ${t.titles.join(' › ')}`).join('\n') + (fails.length ? '\n' : ''));
    const mins = Math.round((report.stats?.duration ?? 0) / 60000);
    const load = (report.errors ?? []).map((e) => firstLine(e.message)).filter(Boolean);
    console.log(`[${name}] 전체 ${n.total} · 통과 ${n.passed} · 실패 ${n.failed} · 건너뜀 ${n.skipped} · 끊김 ${n.interrupted} · ${mins}분${load.length ? ` · 전체 오류 ${load.length}개: ${clean(load[0])}` : ''}`);
}

/** 단계 전부 묶기 */
function merge(dir) {
    const order = ['sample', 'smoke', 'rest', 'serial', 'mn', 'mnserial'];
    const lines = ['| 단계 | 서버 | 전체 | 통과 | 실패 | 건너뜀 | 끊김 | 걸린 분 |', '|---|---|---|---|---|---|---|---|'];
    const sum = { total: 0, passed: 0, failed: 0, skipped: 0, interrupted: 0, mins: 0 };
    const failRows = [];
    // 다시 돌린 결과: 키 → 통과/실패
    const rerun = new Map();
    for (const f of fs.readdirSync(dir).filter((x) => /^rerun-.*\.json$/.test(x))) {
        for (const t of readTests(path.join(dir, f)).tests) rerun.set(keyOf(t), t.status === 'expected' ? '다시 통과(흔들림 후보)' : '다시도 실패');
    }
    for (const name of order) {
        const file = path.join(dir, `${name}.json`);
        if (!fs.existsSync(file)) continue;
        const { report, tests } = readTests(file);
        const c = { total: tests.length, passed: 0, failed: 0, skipped: 0, interrupted: 0 };
        for (const t of tests) {
            if (t.status === 'expected') c.passed += 1;
            else if (t.status === 'skipped') { if (t.result.status === 'interrupted') c.interrupted += 1; else c.skipped += 1; }
            else c.failed += 1;
            if (isFail(t)) {
                const err = firstLine(t.result.errors?.[0]?.message ?? t.result.error?.message ?? t.result.status);
                const art = (t.result.attachments ?? []).filter((a) => a.path).map((a) => norm(path.relative(dir, a.path)))[0] ?? '';
                failRows.push([idOf(t.titles[t.titles.length - 1]), t.project, `${t.file}:${t.line}`, name, t.result.status ?? '', clean(err), rerun.get(keyOf(t)) ?? '안 다시 돌림', art, '', ''].join('\t'));
            }
        }
        const mins = Math.round((report.stats?.duration ?? 0) / 60000);
        lines.push(`| ${name} | ${name.startsWith('mn') ? 2 : 1} | ${c.total} | ${c.passed} | ${c.failed} | ${c.skipped} | ${c.interrupted} | ${mins} |`);
        for (const k of Object.keys(c)) sum[k] += c[k];
        sum.mins += mins;
    }
    lines.push(`| **합** | | **${sum.total}** | **${sum.passed}** | **${sum.failed}** | **${sum.skipped}** | **${sum.interrupted}** | **${sum.mins}** |`);
    const head = ['번호', '프로젝트', '파일:줄', '단계', '상태', '오류 첫 줄', '다시 돌린 결과', '기록물', '분류(진짜 버그/시험이 낡음/환경·흔들림/모름)', '근거'].join('\t');
    fs.writeFileSync(path.join(dir, 'failed-all.tsv'), `${head}\n${failRows.join('\n')}${failRows.length ? '\n' : ''}`);
    fs.writeFileSync(path.join(dir, 'summary-table.txt'), `${lines.join('\n')}\n`);
    console.log(lines.join('\n'));
    console.log(`실패 ${failRows.length}줄 → failed-all.tsv (분류 칸은 비어 있음)`);
}

const [a, b] = process.argv.slice(2);
if (a === '--merge') merge(b);
else if (a && b) one(a, b);
else { console.error('쓰기: node summary.js <단계.json> <단계 이름> | node summary.js --merge <결과 폴더>'); process.exit(2); }
