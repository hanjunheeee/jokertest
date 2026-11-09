'use strict';

// 관리자 조회 줄 파일, Node마다 관리자 조회를 한 번에 하나씩 차례로 + SQL에 시간 제한 붙이기
// 관리자 영역 서비스가 queryQueue.run(fn)·withTimeoutHint(sql)로 씀 (관리자는 둘뿐이라 게임 조회보다 뒤로만)
const { createError } = require('../../../utils/appError');

// 줄 기다림 한도 (넘으면 포기하고 503)
const WAIT_LIMIT_MS = 10_000;
// MySQL "MAX_EXECUTION_TIME 넘음" 오류 번호
const QUERY_TIMEOUT_ERRNO = 3024;
const DEFAULT_LIMIT_MS = 3000;

const busy = () => createError('관리자 조회가 밀려 있어요. 잠시 뒤 다시 해 주세요.', 503, 'ADMIN_BUSY');
const queryTimeout = () => createError('조회가 오래 걸려 멈췄어요. 잠시 뒤 다시 해 주세요.', 503, 'ADMIN_QUERY_TIMEOUT');

// sequelize가 감싼 MySQL 오류에서 번호 찾기
const isQueryTimeoutError = (error) => [error, error?.parent, error?.original]
    .some((candidate) => candidate?.errno === QUERY_TIMEOUT_ERRNO);

// 줄 하나 만들기 (시험은 한도를 짧게)
const createQueryQueue = ({ waitLimitMs = WAIT_LIMIT_MS } = {}) => {
    let tail = Promise.resolve();

    // 한도 지나도록 차례가 안 오면 503 + 그 일은 건너뜀 (돌기 시작한 일은 끝까지)
    const run = (fn) => new Promise((resolve, reject) => {
        let abandoned = false;
        const timer = setTimeout(() => {
            abandoned = true;
            reject(busy());
        }, waitLimitMs);
        // tail은 늘 성공으로 끝나게 → 앞 일 실패와 상관없이 다음 일 이어감
        tail = tail.then(async () => {
            if (abandoned) return;
            clearTimeout(timer);
            try {
                resolve(await fn());
            } catch (error) {
                reject(isQueryTimeoutError(error) ? queryTimeout() : error);
            }
        });
    });

    return { run };
};

// SQL 맨 앞 SELECT 뒤에 시간 제한 붙임 (예: 'SELECT id FROM users' → 'SELECT /*+ MAX_EXECUTION_TIME(3000) */ id FROM users')
const withTimeoutHint = (sql, ms = DEFAULT_LIMIT_MS) => {
    const text = String(sql).trimStart();
    if (!/^SELECT\b/i.test(text)) throw new Error('withTimeoutHint는 SELECT에만 씀');
    if (!Number.isInteger(ms) || ms <= 0) throw new Error('시간 제한은 양의 정수(ms)');
    return text.replace(/^SELECT\b/i, `SELECT /*+ MAX_EXECUTION_TIME(${ms}) */`);
};

const shared = createQueryQueue();

module.exports = {
    WAIT_LIMIT_MS,
    createQueryQueue,
    withTimeoutHint,
    isQueryTimeoutError,
    run: (fn) => shared.run(fn),
};
