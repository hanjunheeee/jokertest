// 진짜 DB 시험용 격리 DB 만들기 파일, 로컬 docker jokertest-db-1 안에 시험 전용 DB·계정을 새로 만듦
// 쓰는 법(backend 폴더): node scripts/setup-test-db.js → .env.testdb(git 안 올라감)에 F01_TEST_DATABASE_URL 씀
//
// - DB 이름은 tests/helpers/isolatedTestDb.js가 허용하는 두 이름만 (본 DB + _restore_check)
// - 개발 DB(joker·joker_realgame)는 안 건드림: 아래 SQL은 시험 DB 이름과 시험 계정만 다룸
// - 비밀번호는 매번 새로 만들어 .env.testdb에만 씀 (화면에 안 찍음)
// - 다시 돌리면 시험 DB를 지우고 빈 DB로 새로 만듦 (시험이 표를 직접 만들고 지움)
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CONTAINER = process.env.TEST_DB_CONTAINER || 'jokertest-db-1';
const DB_NAME = 'pluto_f01_20260909_al';
const RESTORE_DB_NAME = `${DB_NAME}_restore_check`;
const DB_USER = 'mmc_dbtest';
const HOST_PORT = process.env.TEST_DB_PORT || '3306';
const OUT_FILE = path.join(__dirname, '..', '.env.testdb');

// 개발 DB 이름이 섞이면 바로 멈춤 (실수로 바꿔 쓰는 것 막기)
for (const name of [DB_NAME, RESTORE_DB_NAME]) {
    if (/^joker/.test(name)) throw new Error(`개발 DB 이름은 못 씀: ${name}`);
}

// 영문·숫자만 (URL·SQL 따옴표 걱정 없게)
const password = crypto.randomBytes(24).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 28);

// GRANT의 _ 는 아무 글자로 읽혀서 \_ 로 막음 (딱 이 두 이름만)
const grantName = (name) => name.replace(/_/g, '\\_');

const sql = `
DROP DATABASE IF EXISTS \`${DB_NAME}\`;
DROP DATABASE IF EXISTS \`${RESTORE_DB_NAME}\`;
CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${password}';
ALTER USER '${DB_USER}'@'%' IDENTIFIED BY '${password}';
GRANT ALL PRIVILEGES ON \`${grantName(DB_NAME)}\`.* TO '${DB_USER}'@'%';
GRANT ALL PRIVILEGES ON \`${grantName(RESTORE_DB_NAME)}\`.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
`;

// SQL은 표준 입력으로 넘김 (비밀번호가 명령 줄·화면에 안 남게), root 비번은 컨테이너 안 환경값
const result = spawnSync('docker', ['exec', '-i', CONTAINER, 'sh', '-c', 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'], {
    input: sql,
    encoding: 'utf8',
});
// 비번 쓰기 경고 한 줄은 빼고 봄
const messages = `${result.stdout ?? ''}${result.stderr ?? ''}`.split(/\r?\n/)
    .filter((line) => line.trim() && !/Using a password on the command line/.test(line));
if (result.status !== 0 || messages.length > 0) {
    console.error('시험 DB 만들기 실패:', messages.join(' | ') || `종료 코드 ${result.status}`);
    process.exit(1);
}

const url = `mysql://${DB_USER}:${password}@127.0.0.1:${HOST_PORT}/${DB_NAME}`;
fs.writeFileSync(OUT_FILE, `# 진짜 DB 시험용 (scripts/setup-test-db.js가 만듦, git에 안 올라감)\nF01_TEST_DATABASE_URL=${url}\n`);
console.log(`시험 DB ${DB_NAME} 만듦, 계정 ${DB_USER}, 주소는 .env.testdb에 씀`);
