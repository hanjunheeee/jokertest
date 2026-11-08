'use strict';

// 운영 받침 시험용 가짜들, 내부 API 시험 서버 · 쿠폰/신고 가짜 표 · 가짜 소켓 io
// ops-*.test.js가 씀 (진짜 DB 안 씀)
const http = require('node:http');
const express = require('express');
const { listenOnFetchableUrl } = require('../helpers/fetchablePort');

const GOOD_KEY = 'k'.repeat(40);

// 내부 API만 붙인 작은 앱을 띄우고 주소 돌려줌 (끝나면 닫음)
const startInternalApp = async (t, { env = { INTERNAL_API_KEY: GOOD_KEY }, max = 1000, now } = {}) => {
    const { createInternalRouter } = require('../../routes/internal.routes');
    const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
    const app = express();
    app.use(express.json());
    app.use('/internal', createInternalRouter({ env, max, now }));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = http.createServer(app);
    const url = await listenOnFetchableUrl(server);
    t.after(() => new Promise((resolve) => server.close(() => resolve())));
    return url;
};

// 내부 API 부르기 (key 없으면 머리글 안 붙임)
const callInternal = async (url, method, path, { key, body } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (key !== undefined) headers['x-internal-key'] = key;
    const response = await fetch(`${url}/internal${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, body: json, headers: response.headers };
};

const uniqueError = () => {
    const error = new Error('Duplicate entry');
    error.name = 'SequelizeUniqueConstraintError';
    return error;
};

// 쿠폰 표 두 개를 가짜 경제 db에 붙임 (잠금·되돌리기 흉내)
const attachCouponTables = (db, coupons = []) => {
    const couponRows = coupons.map((row, index) => ({
        id: index + 1, used_count: 0, max_uses: null, starts_at: null, ends_at: null, is_active: true, ...row,
    }));
    const redemptions = [];
    const tails = new Map();
    const hooks = { beforeRedemptionCreate: null };

    // 같은 쿠폰 줄은 한 트랜잭션만 (FOR UPDATE 흉내)
    const lockRow = async (key, transaction) => {
        const tail = tails.get(key) ?? Promise.resolve();
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        tails.set(key, tail.then(() => held));
        await tail;
        transaction._releasers.push(release);
    };

    db.Coupon = {
        async findOne({ where, transaction, lock }) {
            const row = couponRows.find((candidate) => candidate.code === where.code);
            if (row && lock && transaction) await lockRow(`coupon:${row.id}`, transaction);
            return row ? { ...row } : null;
        },
        async update(patch, { where, transaction }) {
            const row = couponRows.find((candidate) => candidate.id === where.id);
            const before = { ...row };
            transaction?._undo?.push(() => Object.assign(row, before));
            Object.assign(row, patch);
            return [1];
        },
    };
    db.CouponRedemption = {
        async findOne({ where }) {
            return redemptions.find((r) => r.coupon_id === where.coupon_id && r.user_id === where.user_id) ?? null;
        },
        async create(values, { transaction }) {
            if (hooks.beforeRedemptionCreate) await hooks.beforeRedemptionCreate(values);
            if (redemptions.some((r) => r.coupon_id === values.coupon_id && r.user_id === values.user_id)) throw uniqueError();
            const record = { ...values };
            redemptions.push(record);
            transaction?._undo?.push(() => redemptions.splice(redemptions.indexOf(record), 1));
            return record;
        },
    };
    return { couponRows, redemptions, hooks };
};

// 신고 표 가짜 db (판 결과 참가자 + 신고 + 증거)
const createReportDb = ({ resultPlayers = [] } = {}) => {
    const reports = [];
    const evidence = [];
    const hooks = { beforeCreate: null, evidenceFails: false };
    return {
        reports,
        evidence,
        hooks,
        GameResultPlayer: {
            async count({ where }) {
                return resultPlayers.filter((p) => p.game_id === where.game_id && where.user_id.includes(p.user_id)).length;
            },
        },
        Report: {
            async findOne({ where }) {
                return reports.find((r) => r.reporter_id === where.reporter_id && r.target_id === where.target_id && r.game_id === where.game_id) ?? null;
            },
            async create(values) {
                if (hooks.beforeCreate) await hooks.beforeCreate(values);
                if (reports.some((r) => r.reporter_id === values.reporter_id && r.target_id === values.target_id && r.game_id === values.game_id)) {
                    throw uniqueError();
                }
                const record = { id: reports.length + 1, ...values };
                reports.push(record);
                return record;
            },
        },
        ReportChatEvidence: {
            async create(values) {
                if (hooks.evidenceFails) throw new Error('DB 꺼짐');
                evidence.push(values);
                return values;
            },
        },
    };
};

// 가짜 소켓 io (끊기·알림 시험용), in(채널).fetchSockets()는 그 채널 든 소켓만
const createFakeIo = (sockets) => {
    const map = new Map(sockets.map((socket) => [socket.id, socket]));
    return {
        sockets: { sockets: map },
        in: (channel) => ({
            fetchSockets: async () => [...map.values()].filter((socket) => socket.rooms?.has?.(channel)),
        }),
    };
};

// 가짜 소켓: 자기 id 채널 + 계정 채널(user:<uuid>)에 든 채로 만듦 (연결 처리기가 넣는 것과 같게)
const createSocketStub = (id, uuid) => {
    const socket = {
        id,
        rooms: new Set([id, `user:${uuid}`]),
        data: { user: { uuid } },
        emitted: [],
        disconnected: false,
        emit(event, payload) { socket.emitted.push({ event, payload }); },
        disconnect() { socket.disconnected = true; },
    };
    return socket;
};

// 콘솔 출력 다 모으기 (끝나면 되돌림)
const captureConsole = (t) => {
    const lines = [];
    for (const level of ['log', 'info', 'warn', 'error']) {
        const original = console[level];
        console[level] = (...args) => { lines.push(args.map((a) => (typeof a === 'string' ? a : (a?.stack ?? JSON.stringify(a)))).join(' ')); };
        t.after(() => { console[level] = original; });
    }
    return lines;
};

module.exports = {
    GOOD_KEY,
    startInternalApp,
    callInternal,
    uniqueError,
    attachCouponTables,
    createReportDb,
    createFakeIo,
    createSocketStub,
    captureConsole,
};
