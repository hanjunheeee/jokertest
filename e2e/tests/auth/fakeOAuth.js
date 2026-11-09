'use strict';

// 가짜 Google·Discord 제공자 서버 파일, 인가 화면(바로 돌려보냄)·코드→토큰·토큰→프로필 세 주소만 흉내
// tests/auth/social-provider.spec.js가 따로 띄운 백엔드(GOOGLE_·DISCORD_OAUTH_BASE_URL)와 같이 씀 (시험 파일 아님)
const http = require('node:http');
const crypto = require('node:crypto');

// 백엔드 constants.js가 붙이는 경로와 같게
const ROUTES = {
    google: { authorize: '/o/oauth2/v2/auth', token: '/token', profile: '/v1/userinfo' },
    discord: { authorize: '/api/oauth2/authorize', token: '/api/oauth2/token', profile: '/api/users/@me' },
};

const readBody = (req) => new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => resolve(body));
});

const sendJson = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
};

/**
 * 가짜 제공자 띄우기
 * 시험은 next(provider, 다음 사람)로 다음 인가에 돌려줄 사람을 정함
 *   사람 = Google { sub, email, email_verified } / Discord { id, email, verified }
 *   'cancel' = 인가 화면에서 취소 · { failToken: true } = 코드 교환이 500
 * @param {number} port
 * @returns {Promise<{ url:string, next:Function, authorizeLog:object[], close:Function }>}
 */
async function startFakeOAuth(port) {
    const queue = { google: [], discord: [] };
    const codes = new Map();
    const tokens = new Map();
    const authorizeLog = [];

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const provider = Object.keys(ROUTES).find((p) => Object.values(ROUTES[p]).includes(url.pathname));
        if (!provider) return sendJson(res, 404, { error: 'not_found' });
        const routes = ROUTES[provider];

        // 인가 화면: 사람 고르는 화면 없이 바로 돌아갈 주소로
        if (url.pathname === routes.authorize && req.method === 'GET') {
            const params = Object.fromEntries(url.searchParams);
            authorizeLog.push({ provider, ...params });
            const back = new URL(params.redirect_uri);
            back.searchParams.set('state', params.state ?? '');
            const person = queue[provider].shift();
            if (person === 'cancel' || person === undefined) {
                back.searchParams.set('error', 'access_denied');
            } else {
                const code = `code-${crypto.randomBytes(8).toString('hex')}`;
                codes.set(code, person);
                back.searchParams.set('code', code);
            }
            res.writeHead(302, { location: back.toString() });
            return res.end();
        }

        // 코드 → 토큰 (한 번만 씀)
        if (url.pathname === routes.token && req.method === 'POST') {
            const form = new URLSearchParams(await readBody(req));
            const person = codes.get(form.get('code'));
            codes.delete(form.get('code'));
            if (!person) return sendJson(res, 400, { error: 'invalid_grant' });
            if (person.failToken) return sendJson(res, 500, { error: 'server_error' });
            const accessToken = `at-${crypto.randomBytes(8).toString('hex')}`;
            tokens.set(accessToken, person);
            return sendJson(res, 200, { access_token: accessToken, token_type: 'Bearer' });
        }

        // 토큰 → 프로필
        if (url.pathname === routes.profile && req.method === 'GET') {
            const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
            const person = tokens.get(token);
            if (!person) return sendJson(res, 401, { error: 'invalid_token' });
            return sendJson(res, 200, person);
        }
        return sendJson(res, 405, { error: 'method' });
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
    });

    return {
        url: `http://127.0.0.1:${port}`,
        next: (provider, person) => { queue[provider].push(person); },
        authorizeLog,
        close: () => new Promise((resolve) => server.close(() => resolve())),
    };
}

module.exports = { startFakeOAuth };
