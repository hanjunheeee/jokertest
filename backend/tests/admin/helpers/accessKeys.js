'use strict';

// 시험용 클라우드플레어 Access 흉내 파일, 시험 안에서 RSA 열쇠를 만들어 공개키 묶음을 작은 서버로 주고 같은 열쇠로 표에 서명
// 관리자 시험(문 1 확인·adminTestApp)이 씀, 운영에선 ADMIN_ACCESS_CERTS_URL을 안 읽어 이 서버를 못 씀
const crypto = require('node:crypto');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const { listenOnFetchablePort } = require('../../helpers/fetchablePort');

const TEAM_DOMAIN = 'mmc-test.cloudflareaccess.com';
const ISSUER = `https://${TEAM_DOMAIN}`;
const AUD = 'mmc-test-access-aud';

// RSA 열쇠 한 쌍 + 공개키 JWK (kid 붙임)
const makeKeyPair = (kid) => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
    return { kid, privateKey, jwk };
};

// 서명 없는 표 (alg none 공격 흉내)
const unsignedToken = (claims, kid) => {
    const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${part({ alg: 'none', typ: 'JWT', kid })}.${part(claims)}.`;
};

// 공개키 서버 열기 → { certsUrl, env, sign, otherKey, requests, close }
// sign(claims, options): 기본은 맞는 iss·aud·1시간 만료, options로 열쇠·kid·iss·aud·만료 바꿈
const createAccessKeys = async ({ kid = 'test-kid-1' } = {}) => {
    const main = makeKeyPair(kid);
    const state = { requests: 0, failNext: 0, keys: [main.jwk] };
    const server = http.createServer((req, res) => {
        state.requests += 1;
        if (state.failNext > 0) {
            state.failNext -= 1;
            res.writeHead(500).end();
            return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: state.keys }));
    });
    const { url } = await listenOnFetchablePort(server);
    const certsUrl = `${url}/cdn-cgi/access/certs`;

    const sign = (claims = {}, options = {}) => {
        const key = options.privateKey ?? main.privateKey;
        const body = { email: 'boss@example.com', ...claims };
        return jwt.sign(body, key, {
            algorithm: 'RS256',
            keyid: options.kid ?? kid,
            issuer: options.issuer ?? ISSUER,
            audience: options.audience ?? [AUD],
            expiresIn: options.expiresIn ?? '1h',
        });
    };

    return {
        certsUrl,
        issuer: ISSUER,
        aud: AUD,
        kid,
        env: { ADMIN_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, ADMIN_ACCESS_AUD: AUD, ADMIN_ACCESS_CERTS_URL: certsUrl },
        sign,
        unsigned: (claims = {}) => unsignedToken({ email: 'boss@example.com', iss: ISSUER, aud: [AUD], ...claims }, kid),
        otherKey: () => makeKeyPair(kid),
        // 공개키 묶음 바꾸기 (열쇠 돌리기 흉내)
        setKeys: (jwks) => { state.keys = jwks; },
        failNext: (count) => { state.failNext = count; },
        requestCount: () => state.requests,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
};

module.exports = { createAccessKeys, makeKeyPair, TEAM_DOMAIN, ISSUER, AUD };
