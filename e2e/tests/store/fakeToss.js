'use strict';

// 가짜 토스 승인 서버 파일, 승인(POST /v1/payments/confirm)·결제 조회(GET /v1/payments/:key)를 결제 키 앞말로 나눠 답함
// tests/store/topup-provider.spec.js만 씀 (따로 띄운 백엔드의 TOSS_API_BASE_URL로 들어감, 본 서버 4100은 진짜 주소 그대로)
const http = require('node:http');

// 결제 키 앞말 → 답: ok = 승인 끝(DONE) · reject = 카드 거절(400) · slow = 승인 응답을 늦게(백엔드 10초 한도 넘김), 조회는 승인 끝
const SLOW_MS = 13_000;

/** 승인 끝난 결제 모양 (토스 응답 칸 중 서버가 읽는 것만) */
const donePayment = ({ paymentKey, orderId, amount }) => ({ status: 'DONE', paymentKey, orderId, totalAmount: amount, currency: 'KRW', method: '카드' });

/**
 * 가짜 서버 켜기 → { url, calls, close }
 * calls: 받은 요청 { method, path, auth, idempotencyKey, body } (시험이 횟수·머리글 확인)
 * 조회는 주문 id를 모르므로 승인 때 받은 것을 기억해 둠
 * @param {number} port
 */
async function startFakeToss(port) {
    const calls = [];
    const seen = new Map();
    const timers = new Set();
    const send = (res, status, body) => {
        if (res.writableEnded || res.destroyed) return;
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
    };
    const server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => {
            let body = null;
            try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
            const path = req.url;
            calls.push({ method: req.method, path, auth: req.headers.authorization ?? null, idempotencyKey: req.headers['idempotency-key'] ?? null, body });
            // 승인: 키 앞말로 답 고름
            if (req.method === 'POST' && path === '/v1/payments/confirm' && body) {
                seen.set(body.paymentKey, body);
                if (body.paymentKey.startsWith('pk_reject_')) return send(res, 400, { code: 'REJECT_CARD_PAYMENT', message: '한도초과 혹은 잔액부족으로 결제에 실패했습니다.' });
                if (body.paymentKey.startsWith('pk_slow_')) {
                    const timer = setTimeout(() => { timers.delete(timer); send(res, 200, donePayment(body)); }, SLOW_MS);
                    timers.add(timer);
                    return undefined;
                }
                return send(res, 200, donePayment(body));
            }
            // 조회: 승인 때 본 결제면 승인 끝, 모르면 404
            const match = req.method === 'GET' && /^\/v1\/payments\/([^/]+)$/.exec(path);
            if (match) {
                const known = seen.get(decodeURIComponent(match[1]));
                if (known) return send(res, 200, donePayment(known));
                return send(res, 404, { code: 'NOT_FOUND_PAYMENT', message: '존재하지 않는 결제 정보 입니다.' });
            }
            return send(res, 404, { code: 'NOT_FOUND', message: 'x' });
        });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return {
        url: `http://127.0.0.1:${port}`,
        calls,
        // 늦게 답할 요청도 끊고 닫음
        close: () => new Promise((resolve) => {
            for (const t of timers) clearTimeout(t);
            server.closeAllConnections?.();
            server.close(() => resolve());
        }),
    };
}

module.exports = { startFakeToss, SLOW_MS };
