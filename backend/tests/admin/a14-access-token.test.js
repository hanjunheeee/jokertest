'use strict';

// 클라우드플레어 Access 표(문 1) 검사 시험: 시험이 만든 RSA 열쇠로 서명한 표를 넣어 맞는 표만 통과·이메일 꺼냄, 나머지 6개는 거절
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-016~022 (돌리기: node --env-file=.env.test --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { createAccessVerifier } = require('../../admin/services/core/accessToken');
const { makeKeyPair } = require('./helpers/accessKeys');

const ISSUER = 'https://a14-gate-fake.cloudflareaccess.com';
const AUD = 'a14-gate-fake-aud';
const KID = 'a14-gate-kid';
const main = makeKeyPair(KID);
const other = makeKeyPair(KID);

// 공개키 서버 대신 공개키 묶음을 바로 돌려주는 받기 함수 (네트워크 안 씀)
const fetchCerts = async () => ({ ok: true, status: 200, json: async () => ({ keys: [main.jwk] }) });
const verifier = () => createAccessVerifier({ issuer: ISSUER, aud: AUD, certsUrl: 'http://certs.invalid/certs', fetchImpl: fetchCerts });

// 기본은 맞는 표, options로 한 칸씩 틀리게
const sign = (options = {}) => jwt.sign({ email: 'Boss@Example.test' }, options.privateKey ?? main.privateKey, {
    algorithm: 'RS256',
    keyid: KID,
    issuer: options.issuer ?? ISSUER,
    audience: options.audience ?? [AUD],
    expiresIn: options.expiresIn ?? '1h',
});

// 서명 없는 표 (alg none)
const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const noneToken = () => `${part({ alg: 'none', typ: 'JWT', kid: KID })}.${part({ email: 'boss@example.test', iss: ISSUER, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 3600 })}.`;

// HS256 표 (공개키 글자를 비밀로 쓰는 바꿔치기 공격 흉내)
const hsToken = () => {
    const publicPem = require('node:crypto').createPublicKey({ key: main.jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
    return jwt.sign({ email: 'boss@example.test' }, publicPem, { algorithm: 'HS256', keyid: KID, issuer: ISSUER, audience: [AUD], expiresIn: '1h' });
};

test('A14-B-016 맞는 표 → 통과, 이메일 꺼냄(소문자)', async () => {
    const { email } = await verifier().verify(sign());
    assert.equal(email, 'boss@example.test');
});

// 거절은 모두 403 ADMIN_ACCESS_REQUIRED
const REJECTS = [
    ['017', '다른 열쇠로 서명', () => sign({ privateKey: other.privateKey })],
    ['018', 'aud 다름', () => sign({ audience: ['someone-else-aud'] })],
    ['019', 'iss 다름', () => sign({ issuer: 'https://other-team.cloudflareaccess.com' })],
    ['020', '만료', () => sign({ expiresIn: -10 })],
    ['021', 'alg:none', noneToken],
    ['022', 'HS256', hsToken],
];

for (const [no, label, make] of REJECTS) {
    test(`A14-B-${no} ${label} 표 → 거절 403 ADMIN_ACCESS_REQUIRED`, async () => {
        await assert.rejects(verifier().verify(make()), (error) => {
            assert.equal(error.status, 403);
            assert.equal(error.code, 'ADMIN_ACCESS_REQUIRED');
            return true;
        });
    });
}
