const { createError } = require("../utils/appError");

exports.notFoundHandler = (req, res, next) => {
    next(createError(`${req.method} ${req.url} 라우터를 찾을 수 없습니다.`, 404));
};

exports.globalErrorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    // F-29a(AC-03): /auth/find-id는 원본 오류(SQL·스택·요청 입력값 등)를 로그·응답 어디에도
    // 남기지 않는다 — express.json()이 이 경로보다 먼저 던지는 잘못된 JSON 본문 오류
    // (SyntaxError, status 400)까지 포함해 이 라우트로 가는 모든 미처리 오류는 고정된
    // 코드로만 응답한다. originalUrl 완전일치는 /auth/find-id?x=1 같은 쿼리나
    // /auth/find-id/ 같은 후행 슬래시 변형을 놓친다 — 쿼리를 떼고 후행 슬래시를 지운
    // 경로로 비교해 그 변형들도 이 분기로 들어오게 한다.
    const findIdRequestPath = String(req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '');
    if (findIdRequestPath === '/auth/find-id') {
        const status = (err.status || err.statusCode) === 400 ? 400 : 500;
        const code = status === 400 ? 'INVALID_INPUT' : 'SERVER_ERROR';
        return res.status(status).json({ ok: false, code });
    }

    // F-31a(AC-06 재검토): 가입 범위 세 경로(POST /auth/signup·/auth/signup/email-code·
    // /auth/signup/email-code/verify — 쿼리·후행 슬래시·대소문자 변형 포함) 전부에서 원본
    // 메시지·스택·요청 본문이 로그·응답 어디에도 남지 않아야 한다. 이전 회차는
    // /auth/signup/email-code만 이 보호에 포함시켰다 — POST /auth/signup 자체의 JSON 파서
    // 오류(express.json()이 body-parser로 던지는 SyntaxError에는 원본 요청 본문 전체가
    // err.body에 실려 있다)나 예상 밖 예외는 아래 일반 처리기로 흘러 console.error(err.stack)로
    // 로그에 남을 수 있었다.
    //
    // F-31a(AC-06 CODEX-3 대응): code가 있는 오류는 이 표에 있는 것만 그 code와 여기
    // 직접 박아 둔 고정 문구로 응답한다 — err.message를 그대로 실으면, 이 코드가 앞으로
    // 다른 곳에서 원본을 담은 채로 재사용되기만 해도 그 원문이 그대로 응답에 새 나간다.
    // SIGNUP_PROOF_REQUIRED/SIGNUP_PROOF_INVALID(auth.service.js가 던지는 유일한 code
    // 있는 오류)만 이 표에 있다 — AC-01/AC-03/AC-04 계약이 이 두 code·status(401)를
    // 구분해서 쓴다. 표에 없는 code(예상하지 못한 코드)는 status·message와 무관하게
    // 고정 SERVER_ERROR(500)로 수렴한다.
    const SIGNUP_SCOPED_ALLOWED_ERROR_CODES = {
        SIGNUP_PROOF_REQUIRED: { status: 401, message: '이메일 인증이 필요합니다.' },
        SIGNUP_PROOF_INVALID: { status: 401, message: '이메일 인증 증명이 유효하지 않습니다.' },
    };
    const signupScopedPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (signupScopedPath.startsWith('/auth/signup')) {
        res.set('Cache-Control', 'no-store');
        if (typeof err.code === 'string' && err.code) {
            const fixed = SIGNUP_SCOPED_ALLOWED_ERROR_CODES[err.code];
            if (fixed) {
                return res.status(fixed.status).json({ success: false, message: fixed.message, code: err.code });
            }
            return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
        }
        // code가 없는 오류: 가입 필드 검증 실패(400, INVALID_INPUT)와, 이미 사용 중인
        // 이메일/닉네임(409 — auth.service.js:131,136이 직접 고정한 안전한 문자열만
        // 던진다)은 이번 변경 이전부터의 기존 status·문구를 그대로 유지한다(회귀 금지).
        // 그 밖(404·예상하지 못한 500 등)은 SERVER_ERROR로 수렴시키고, err.message·
        // err.stack·err.body 어느 것도 로그·응답에 담지 않는다.
        //
        // F-31a(AC-06 CODEX-5 대응): code 없는 409를 err.message 그대로 응답하면, 이
        // 분기가 앞으로 다른 code 없는 409(예: user.repositories.js의 toConflictError가
        // 경합에서 던지는 일반 충돌 메시지)까지 무검증으로 통과시켜 임의의 오류 원문이
        // 노출된다 — code가 있는 오류를 허용 목록으로 좁힌 것(위 SIGNUP_SCOPED_ALLOWED_
        // ERROR_CODES)과 같은 원칙으로, 여기서도 실제로 시험이 보존을 요구하는 두 고정
        // 문구만 허용 목록에 올리고 그 밖은 SERVER_ERROR로 수렴시킨다.
        const KNOWN_SIGNUP_DUPLICATE_MESSAGES = new Set([
            "이미 사용 중인 이메일입니다.",
            "이미 사용 중인 닉네임입니다.",
        ]);
        const rawStatus = err.status || err.statusCode;
        if (rawStatus === 409) {
            if (typeof err.message === 'string' && KNOWN_SIGNUP_DUPLICATE_MESSAGES.has(err.message)) {
                return res.status(409).json({ success: false, message: err.message });
            }
            return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
        }
        const status = rawStatus === 400 ? 400 : 500;
        const code = status === 400 ? 'INVALID_INPUT' : 'SERVER_ERROR';
        return res.status(status).json({ ok: false, code });
    }

    // F-29b(AC-06/A-08): 비밀번호 재설정 범위(요청·verify·confirm 및 그 밖의 하위 경로)는
    // 대소문자·후행 슬래시와 무관하게 같은 고정 응답으로 수렴한다 — 토큰이 담긴 쿼리·본문
    // 오류가 원본 메시지·스택으로 새 나가지 않게 한다. 파서 오류(잘못된 JSON 등)로 이
    // 경로에 도달하지 못한 요청도 originalUrl만으로 여기서 잡힌다.
    const resetRequestPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (resetRequestPath.startsWith('/auth/password-reset')) {
        res.set('Cache-Control', 'no-store');
        const rawStatus = err.status || err.statusCode;
        const status = rawStatus === 400 ? 400 : (rawStatus === 404 ? 404 : 500);
        const code = status === 400 ? 'INVALID_INPUT' : (status === 404 ? 'INVALID' : 'SERVER_ERROR');
        return res.status(status).json({ ok: false, code });
    }

    // F-32a(AC-05): 재화 상품 목록·다이아 충전 API 범위는 원본 오류(메시지·스택·중첩 데이터·
    // 요청 본문·헤더)를 로그와 응답 어디에도 남기지 않는다. 결제 어댑터·DB·JSON 파서 오류에는
    // secret이나 요청 원문이 실려 있을 수 있어서다. 쿼리·후행 슬래시·대소문자 변형은 같은 범위로
    // 판정한다. 코드가 있는 오류는 아래 표에 있는 것만 그 코드와 고정 상태·고정 문구로 응답하고,
    // 예상 밖 오류는 SERVER_ERROR(500)로 수렴한다. 인증 401(ACCESS_TOKEN_EXPIRED 포함)의 의미는
    // 유지한다.
    const topupScopedPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    // F-32b: 골드 구매(POST /economy/gold-purchases)도 같은 범위다 — 다이아·골드 원장 원문이나
    // DB 오류 원문을 응답·로그에 남기지 않고 아래 표의 고정 상태·문구로만 응답한다.
    const isTopupScope = topupScopedPath === '/economy/currency-products'
        || topupScopedPath === '/economy/topup'
        || topupScopedPath.startsWith('/economy/topup/')
        || topupScopedPath === '/economy/gold-purchases';
    if (isTopupScope) {
        res.set('Cache-Control', 'no-store');
        const TOPUP_SCOPED_ERRORS = {
            INVALID_PRODUCT_KIND: { status: 400, message: '알 수 없는 상품 종류입니다.' },
            UNKNOWN_TOPUP_ORDER_FIELD: { status: 400, message: '허용되지 않은 필드가 포함되어 있습니다.' },
            INVALID_TOPUP_ORDER_REQUEST: { status: 400, message: '요청 형식이 올바르지 않습니다.' },
            UNKNOWN_TOPUP_CONFIRM_FIELD: { status: 400, message: '허용되지 않은 필드가 포함되어 있습니다.' },
            INVALID_TOPUP_CONFIRM_REQUEST: { status: 400, message: '요청 형식이 올바르지 않습니다.' },
            PRODUCT_NOT_FOUND: { status: 404, message: '상품을 찾을 수 없습니다.' },
            PRODUCT_STOPPED: { status: 409, message: '판매가 중지된 상품입니다.' },
            PRODUCT_VERSION_MISMATCH: { status: 409, message: '상품 정보가 변경되었습니다.' },
            ORDER_NOT_FOUND: { status: 404, message: '주문을 찾을 수 없습니다.' },
            NOT_OWNER: { status: 403, message: '다른 계정의 주문에는 접근할 수 없습니다.' },
            AMOUNT_MISMATCH: { status: 400, message: '결제 금액이 주문과 다릅니다.' },
            PAYMENT_KEY_MISMATCH: { status: 409, message: '이 주문에 이미 다른 결제키가 연결되어 있습니다.' },
            PAYMENT_KEY_CONFLICT: { status: 409, message: '이 결제키는 다른 주문에서 사용 중입니다.' },
            PAYMENT_FAILED: { status: 402, message: '결제가 완료되지 않았습니다.' },
            PAYMENT_PROCESSING: { status: 503, message: '결제 확인이 진행 중입니다. 잠시 후 다시 조회하세요.' },
            CONFIG_MISSING: { status: 503, message: '결제 설정이 올바르지 않습니다.' },
            UNKNOWN_GOLD_PURCHASE_FIELD: { status: 400, message: '허용되지 않은 필드가 포함되어 있습니다.' },
            INVALID_GOLD_PURCHASE_REQUEST: { status: 400, message: '요청 형식이 올바르지 않습니다.' },
            INSUFFICIENT_DIAMOND: { status: 400, message: '다이아 잔액이 부족합니다.' },
            BALANCE_LIMIT_EXCEEDED: { status: 400, message: '잔액 한도를 초과했습니다.' },
            REFERENCE_EVENT_CONFLICT: { status: 409, message: '참조 사건 ID가 이미 다른 요청에 사용되었습니다.' },
        };
        const PUBLIC_PRODUCT_FIELDS = {
            productId: 'string', kind: 'string', displayName: 'string', payCurrency: 'string',
            payAmount: 'number', grantCurrency: 'string', grantAmount: 'number', bonusAmount: 'number', version: 'number',
        };
        // 버전 불일치의 현재 상품은 검증된 공개 필드만, 타입까지 확인해 싣는다.
        const publicProductOf = (candidate) => {
            if (!candidate || typeof candidate !== 'object') return undefined;
            const picked = {};
            for (const [field, type] of Object.entries(PUBLIC_PRODUCT_FIELDS)) {
                if (typeof candidate[field] !== type) return undefined;
                picked[field] = candidate[field];
            }
            return picked;
        };

        const rawStatus = err.status || err.statusCode;
        const rawCode = typeof err.code === 'string' ? err.code : undefined;

        if (rawStatus === 401) {
            if (rawCode === 'ACCESS_TOKEN_EXPIRED') {
                return res.status(401).json({ success: false, message: '액세스 토큰이 만료되었습니다.', code: 'ACCESS_TOKEN_EXPIRED' });
            }
            return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
        }
        // 코드 없는 403은 인증 계층(정지 계정)에서만 나온다. 접두어 뒤에 무엇이 붙어 있든 err.message
        // 원문은 응답에 싣지 않는다 — 정지 안내는 여기 박아 둔 고정 문구로만, 그 밖은 고정 문구다.
        if (rawStatus === 403 && !rawCode) {
            const banned = typeof err.message === 'string' && err.message.startsWith('정지된 계정입니다.');
            return res.status(403).json({ success: false, message: banned ? '정지된 계정입니다.' : '접근 권한이 없습니다.' });
        }
        if (rawCode === 'ECONOMY_FORBIDDEN') {
            return res.status(403).json({ ok: false, code: 'ECONOMY_FORBIDDEN', message: '다른 계정의 경제 데이터에 접근할 수 없습니다.' });
        }
        // 상속 속성(constructor·__proto__·toString 등)을 허용 코드로 오인하지 않도록 자기 속성만 본다.
        const fixed = rawCode && Object.hasOwn(TOPUP_SCOPED_ERRORS, rawCode) ? TOPUP_SCOPED_ERRORS[rawCode] : undefined;
        if (fixed) {
            if (rawCode === 'PAYMENT_PROCESSING') res.set('Retry-After', '2');
            const body = { ok: false, code: rawCode, message: fixed.message };
            if (rawCode === 'PRODUCT_VERSION_MISMATCH') {
                const product = publicProductOf(err.currentProduct);
                if (product) body.product = product;
            }
            return res.status(fixed.status).json(body);
        }
        // 코드 없는 400(JSON 파서 오류 등)은 고정 코드로만, 그 밖은 SERVER_ERROR로 수렴한다.
        if (!rawCode && rawStatus === 400) {
            return res.status(400).json({ ok: false, code: 'INVALID_INPUT', message: '요청 형식이 올바르지 않습니다.' });
        }
        if (!rawCode && rawStatus === 404) {
            return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '요청한 경로를 찾을 수 없습니다.' });
        }
        console.error(`[economy-topup] SERVER_ERROR ${req.method}`);
        return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: '서버 내부에서 에러가 발생했습니다.' });
    }

    console.error('\x1b[31m%s\x1b[0m', err.stack);

    const statusCode = err.status || err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || '서버 내부에서 에러가 발생했습니다.',
        code: err.code,
        error: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
};
