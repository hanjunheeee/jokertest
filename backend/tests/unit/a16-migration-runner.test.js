'use strict';

// 마이그레이션 실행기·준비 검사·명령 파일의 판단 부분 순수 시험 (DB 안 붙음): 목록 34개·체크섬·상태 세 갈래·안내 글·명령 글자·확인 없는 정리 거절
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-001~020
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const migrationRunner = require('../../db/migrationRunner');
const { summarize, describeProblems } = require('../../db/schemaReadiness');
const { MIGRATIONS, parseArgs } = require('../../scripts/migrate-db');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'db', 'migrations');
const M = (num) => MIGRATIONS.find((migration) => migration.name.startsWith(`${num}-`));
const NAMES = MIGRATIONS.map((migration) => migration.name);

// 진짜 파일 복사본을 임시 폴더에 두고 불러옴 (진짜 마이그레이션 파일은 안 건드림)
function loadEditedCopy(t, fileName, edit) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b-a16-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const original = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf8');
    const edited = edit(original);
    assert.notEqual(edited, original, '복사본이 안 바뀜 (바꿀 글자를 못 찾음)');
    const copyPath = path.join(dir, fileName);
    fs.writeFileSync(copyPath, edited);
    return require(copyPath);
}

// 34줄 상태 (기본 = 다 적용·체크섬 맞음), 바꿀 줄만 덮어씀
function statusRows(overrides = {}) {
    return NAMES.map((name) => ({ name, status: 'applied', checksumMatches: true, ...(overrides[name.slice(0, 4)] ?? {}) }));
}
const PENDING = { status: 'pending', checksumMatches: null };

test('A16-B-001 마이그레이션 목록은 34개, 처음 0001·마지막 0034', () => {
    assert.equal(MIGRATIONS.length, 34);
    assert.equal(NAMES[0], '0001-legacy-baseline');
    assert.equal(NAMES[NAMES.length - 1], '0034-add-game-settings');
});

test('A16-B-002 목록이 번호 차례대로 하나씩 늘고 빈 번호 없음 (0035 없음)', () => {
    const numbers = NAMES.map((name) => Number(name.slice(0, 4)));
    assert.deepEqual(numbers, Array.from({ length: 34 }, (_, i) => i + 1)); // → [1, 2, …, 34]
    assert.equal(NAMES.some((name) => name.startsWith('0035')), false);
});

test('A16-B-003 이름마다 같은 이름 파일이 있고 34개 이름이 서로 다름', () => {
    for (const name of NAMES) {
        assert.ok(fs.existsSync(path.join(MIGRATIONS_DIR, `${name}.js`)), `${name}.js 파일 없음`);
    }
    assert.equal(new Set(NAMES).size, 34);
});

test('A16-B-004 같은 마이그레이션 체크섬은 두 번 재도 같고 16진수 64자', () => {
    const first = migrationRunner.checksumOf(M('0034'));
    const second = migrationRunner.checksumOf(M('0034'));
    assert.equal(first, second);
    assert.match(first, /^[0-9a-f]{64}$/);
});

test('A16-B-005 0034 복사본에서 처음 값 1 → 2로 바꾸면 체크섬이 다름', (t) => {
    // 처음 줄 값만 1 → 2 (파일 한 글자)
    const copy = loadEditedCopy(t, '0034-add-game-settings.js', (source) => source.replace('valueInt: 1 }', 'valueInt: 2 }'));
    assert.equal(copy.SEED_ROWS[0].valueInt, 2);
    assert.notEqual(migrationRunner.checksumOf(copy), migrationRunner.checksumOf(M('0034')));
});

test('A16-B-006 같은 이름·같은 up이어도 down이 있고 없고에 따라 체크섬이 다름', () => {
    const up = async () => {};
    const withDown = { name: '9901-test-same', up, async down() {} };
    const withoutDown = { name: '9901-test-same', up };
    assert.notEqual(migrationRunner.checksumOf(withDown), migrationRunner.checksumOf(withoutDown));
});

test('A16-B-007 0033 복사본 up 안에 주석 한 줄만 더해도 체크섬이 다름', (t) => {
    const copy = loadEditedCopy(t, '0033-add-game-desertions.js', (source) => source.replace(
        'async up(queryInterface, Sequelize) {',
        'async up(queryInterface, Sequelize) {\n        // 시험이 더한 주석 한 줄',
    ));
    assert.notEqual(migrationRunner.checksumOf(copy), migrationRunner.checksumOf(M('0033')));
});

test('A16-B-008 up·down 같고 이름만 0034-x로 바꾸면 체크섬이 다름', () => {
    const renamed = { ...M('0034'), name: '0034-x' };
    assert.notEqual(migrationRunner.checksumOf(renamed), migrationRunner.checksumOf(M('0034')));
});

// 상태 줄 세 갈래 (값 6 = 시험 6개)
const SUMMARY_CASES = [
    ['A16-B-009', '34개 다 적용·체크섬 맞음 → 준비 됨, 세 목록 빔', {}, { ready: true, pending: [], broken: [], changed: [] }],
    ['A16-B-010', '0034만 안 돌림 → pending [0034]', { '0034': PENDING }, { ready: false, pending: ['0034-add-game-settings'], broken: [], changed: [] }],
    ['A16-B-011', '0033 failed → broken [0033]', { '0033': { status: 'failed' } }, { ready: false, pending: [], broken: ['0033-add-game-desertions'], changed: [] }],
    ['A16-B-012', '0033 running → broken [0033]', { '0033': { status: 'running' } }, { ready: false, pending: [], broken: ['0033-add-game-desertions'], changed: [] }],
    ['A16-B-013', '0034 적용됐는데 체크섬 안 맞음 → changed [0034]', { '0034': { checksumMatches: false } }, { ready: false, pending: [], broken: [], changed: ['0034-add-game-settings'] }],
    ['A16-B-014', '0032 안 돌림 + 0033 failed + 0034 체크섬 다름 → 세 목록에 하나씩',
        { '0032': PENDING, '0033': { status: 'failed' }, '0034': { checksumMatches: false } },
        { ready: false, pending: ['0032-add-inquiries'], broken: ['0033-add-game-desertions'], changed: ['0034-add-game-settings'] }],
];
for (const [id, label, overrides, expected] of SUMMARY_CASES) {
    test(`${id} 상태 세 갈래: ${label}`, () => {
        assert.deepEqual(summarize(statusRows(overrides)), expected);
    });
}

test('A16-B-015 사람이 읽을 한 줄에 세 갈래 이름과 할 일이 다 들어감', () => {
    const text = describeProblems({ pending: ['0032-add-inquiries'], broken: ['0033-add-game-desertions'], changed: ['0034-add-game-settings'] });
    assert.ok(text.includes('안 돌린 마이그레이션 1개 [0032-add-inquiries]'), text);
    assert.ok(text.includes('실패·멈춘 마이그레이션 [0033-add-game-desertions]'), text);
    assert.ok(text.includes('적용 뒤 파일이 바뀐 마이그레이션 [0034-add-game-settings]'), text);
    // 끝: status로 확인하고 migrate 돌리기
    assert.ok(text.includes('migrate-db.js status'), text);
    assert.ok(text.endsWith('migrate 돌리기'), text);
});

test('A16-B-016 0033·0034만 안 돌렸으면 두 이름만, 실패·바뀜 글 없음', () => {
    const text = describeProblems({ pending: ['0033-add-game-desertions', '0034-add-game-settings'], broken: [], changed: [] });
    assert.ok(text.includes('안 돌린 마이그레이션 2개 [0033-add-game-desertions, 0034-add-game-settings]'), text);
    assert.equal(text.includes('실패'), false);
    assert.equal(text.includes('바뀐'), false);
});

// 명령 글자 읽기 (값 3 = 시험 3개)
const ARG_CASES = [
    ['A16-B-017', 'migrate 하나 → 명령 migrate, 옵션 빔', ['migrate'], { command: 'migrate', options: {} }],
    ['A16-B-018', 'resolve-failure --name 이름 --confirm → 이름·확인 true',
        ['resolve-failure', '--name', '0034-add-game-settings', '--confirm'],
        { command: 'resolve-failure', options: { name: '0034-add-game-settings', confirm: true } }],
    ['A16-B-019', 'resolve-failure --name=이름 → 이름만, 확인 없음',
        ['resolve-failure', '--name=0033-add-game-desertions'],
        { command: 'resolve-failure', options: { name: '0033-add-game-desertions' } }],
];
for (const [id, label, argv, expected] of ARG_CASES) {
    test(`${id} 명령 글자 읽기: ${label}`, () => {
        assert.deepEqual(parseArgs(argv), expected);
    });
}

test('A16-B-020 확인 표시 없이 실패 이력 정리는 DB를 안 보고 바로 거절', async () => {
    await assert.rejects(
        migrationRunner.resolveFailure({ sequelize: undefined, name: '0034-add-game-settings', confirmRecovered: false }),
        { message: /^confirmRecovered=true 없이는 실패 이력을 정리할 수 없습니다/ },
    );
});
