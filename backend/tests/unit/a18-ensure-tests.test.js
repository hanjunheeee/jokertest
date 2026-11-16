'use strict';

// 시험 0개면 실패하는 확인 스크립트 시험 — 빈 폴더·폴더 안 줌은 종료 1, 시험 파일 있으면 종료 0, node_modules·점 폴더 시험은 안 셈
// 목록 A18-B-204~208 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/unit/a18-ensure-tests.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', '..', '..', 'tools', '시험도구', 'ensure-tests.js');

// 운영체제 임시 폴더 아래 내 이름 폴더 하나 (시험 끝에 지움), files = { '상대 경로': '내용' }
function tempFolder(t, files = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b-a18-ensure-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
    }
    return dir;
}

// 스크립트 따로 띄움 → { code, out(표준 출력+오류 합침) }, 작업 폴더도 임시 폴더
function run(args, cwd) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', timeout: 20_000 });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('A18-B-204 빈 폴더 → 종료 1, "하나도 없음"', (t) => {
    const dir = tempFolder(t);
    const r = run([dir], dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /하나도 없음/);
});

test('A18-B-205 a.test.js 하나 → 종료 0, "1개"', (t) => {
    const dir = tempFolder(t, { 'a.test.js': '// 빈 시험\n' });
    const r = run([dir], dir);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1개/);
});

test('A18-B-206 sub/b.spec.mjs 하나 → 종료 0', (t) => {
    const dir = tempFolder(t, { 'sub/b.spec.mjs': '// 빈 시험\n' });
    const r = run([dir], dir);
    assert.equal(r.code, 0, r.out);
});

test('A18-B-207 폴더 안 줌 → 종료 1', (t) => {
    const dir = tempFolder(t);
    const r = run([], dir);
    assert.equal(r.code, 1, r.out);
});

test('A18-B-208 시험 파일이 node_modules/x/a.test.js·.cache/b.test.js에만 → 종료 1', (t) => {
    const dir = tempFolder(t, { 'node_modules/x/a.test.js': '//\n', '.cache/b.test.js': '//\n' });
    const r = run([dir], dir);
    assert.equal(r.code, 1, r.out);
});
