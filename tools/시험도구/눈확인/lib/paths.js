'use strict';

// 눈 확인 도구가 쓰는 자리 모음, e2e 폴더·돌린 흔적 폴더·신호 파일
// run.js와 lib 파일들이 씀 — e2e 도우미는 이 자리에서 불러 씀 (새로 안 짬)
const path = require('node:path');
const { createRequire } = require('node:module');

const TOOL_DIR = path.join(__dirname, '..');
const REPO_DIR = path.join(TOOL_DIR, '..', '..', '..');
const E2E_DIR = path.join(REPO_DIR, 'e2e');
// 돌린 흔적은 git에 안 올라가는 곳 (tools/시험도구/.gitignore의 .run/)
const RUN_DIR = path.join(TOOL_DIR, '..', '.run', 'eyecheck');
const SHOTS_DIR = path.join(RUN_DIR, 'shots');
const SIGNAL_FILE = path.join(RUN_DIR, 'next');
const STATUS_FILE = path.join(RUN_DIR, 'status.json');
const PIDS_FILE = path.join(RUN_DIR, 'pids.json');
const LOG_FILE = path.join(RUN_DIR, 'run.log');
const TIMES_FILE = path.join(RUN_DIR, 'times.jsonl');
// 장면 근거 글: reports/ 것 먼저, 없으면 docs/ 사본 (reports/는 git에 안 올라감) → 둘 다 없으면 장면 파일 글만 씀
const LIST_FILES = [
    path.join(REPO_DIR, 'reports', '최종보고_2026-11-16', '눈으로_확인할_것.md'),
    path.join(REPO_DIR, 'docs', '맥북_이어받기_2026-11-17', '눈으로_확인할_것.md'),
];
const LIST_FILE = LIST_FILES[0];

// e2e 폴더 기준 require (@playwright/test가 e2e/node_modules에만 있음 → 도우미와 같은 것을 씀)
const e2eRequire = createRequire(path.join(E2E_DIR, 'package.json'));
// e2e 안 파일 불러오기 → 예: fromE2e('helpers/ui')
const fromE2e = (rel) => require(path.join(E2E_DIR, rel));

module.exports = { TOOL_DIR, REPO_DIR, E2E_DIR, RUN_DIR, SHOTS_DIR, SIGNAL_FILE, STATUS_FILE, PIDS_FILE, LOG_FILE, TIMES_FILE, LIST_FILE, LIST_FILES, e2eRequire, fromE2e };
