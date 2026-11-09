'use strict';

// 관리자 경로 목록 파일, admin/index.js 붙이는 자리 표 + 라우터 파일 속 경로를 읽어 전 경로 표를 만듦 (손으로 안 적음)
// 마무리 시험(AD-300~302)이 씀: 경로가 새로 생기면 이 표에 바로 나타나 시험이 잡음
const crypto = require('node:crypto');

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// 라우터 파일 꺼내기 (admin/index.js loadRouter와 같은 규칙)
const routerOf = ({ file, pick }) => {
    const exported = require(`../../../admin/routes/${file}.routes`);
    return pick ? exported[pick] : exported;
};

// 라우터 한 개 속 경로 → [{ method, path }] (안에 또 붙인 라우터가 생겨도 못 읽으면 바로 알림)
const routesInRouter = (router, file) => router.stack.flatMap((layer) => {
    if (layer.route) {
        return Object.keys(layer.route.methods).filter((method) => method !== '_all')
            .map((method) => ({ method: method.toUpperCase(), path: layer.route.path }));
    }
    if (layer.handle?.stack) throw new Error(`${file}.routes.js 안에 라우터를 또 붙임 — 이 목록 읽기를 고쳐야 함`);
    return [];
});

// 전 경로 표 → [{ method, mount, path, fullPath, key, isWrite, isAuth }]
// 예) { method:'POST', mount:'/members/:uuid', path:'/bans', fullPath:'/admin-api/members/:uuid/bans', key:'POST /admin-api/members/:uuid/bans' }
const listAdminRoutes = () => {
    const { MOUNTS } = require('../../../admin');
    return MOUNTS.flatMap((mount) => routesInRouter(routerOf(mount), mount.file).map(({ method, path }) => {
        const fullPath = `/admin-api${mount.path}${path === '/' ? '' : path}`;
        return {
            method,
            mount: mount.path,
            path,
            fullPath,
            key: `${method} ${fullPath}`,
            isWrite: !READ_METHODS.has(method),
            isAuth: mount.path === '/auth',
        };
    }));
};

// 경로 속 :이름 → 값 (값은 values[이름] 또는 values[`${mount}:${이름}`])
// 모르는 이름이면 던짐 → 새 경로가 생기면 시험 표에 값 더하라고 알림
const fillPath = (route, values) => route.fullPath.replace(/:(\w+)/g, (all, name) => {
    const value = values[`${route.mount}:${name}`] ?? values[name];
    if (value === undefined || value === null) throw new Error(`${route.key}: 경로 칸 :${name} 값이 시험 표에 없음`);
    return encodeURIComponent(String(value));
});

// 로그인·DB 없이 막힘만 볼 때 쓰는 아무 값 (모양만 맞춤)
const dummyValues = () => ({
    uuid: crypto.randomUUID(), gameId: crypto.randomUUID(), orderId: 'ord-dummy', productId: 'dummy-product', id: 1, banId: 1,
});

module.exports = { READ_METHODS, listAdminRoutes, fillPath, dummyValues };
