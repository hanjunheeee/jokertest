// 오류 응답 파일, 없는 경로 404 + 마지막 오류 처리기 (경로 범위마다 응답 모양 따로)
// index.js가 모든 라우터 뒤에 붙임, 경로 시험들도 같은 두 처리기를 붙여 씀
const { createError } = require("../utils/appError");

// 어느 경로에도 안 걸린 요청은 404 오류로 넘김
exports.notFoundHandler = (req, res, next) => {
    next(createError(`${req.method} ${req.url} 라우터를 찾을 수 없습니다.`, 404));
};

// 아이디 찾기·가입·비번 재설정·충전 경로는 정한 코드·문구만 내보내고, 나머지는 기본 모양
exports.globalErrorHandler = (err, req, res, next) => {
    // 이미 응답 나갔으면 Express 기본 처리로 넘김
    if (res.headersSent) {
        return next(err);
    }

    // 아이디 찾기: 400·500 코드만 (내부 문구 안 보이기)
    const findIdRequestPath = String(req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '');
    if (findIdRequestPath === '/auth/find-id') {
        const status = (err.status || err.statusCode) === 400 ? 400 : 500;
        const code = status === 400 ? 'INVALID_INPUT' : 'SERVER_ERROR';
        return res.status(status).json({ ok: false, code });
    }

    // 가입·인증번호 경로: 캐시 금지, 정한 코드·문구만
    const SIGNUP_SCOPED_ERRORS = {
        SIGNUP_PROOF_REQUIRED: { status: 401, message: '이메일 인증이 필요합니다.' },
        SIGNUP_PROOF_INVALID: { status: 401, message: '이메일 인증 증명이 유효하지 않습니다.' },
    };
    const signupScopedPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (signupScopedPath.startsWith('/auth/signup')) {
        res.set('Cache-Control', 'no-store');
        // 코드 있는 오류는 인증 증명 오류만 문구 그대로, 다른 코드는 500 (내부 코드 안 보이기)
        if (typeof err.code === 'string' && err.code) {
            const fixed = SIGNUP_SCOPED_ERRORS[err.code];
            if (fixed) {
                return res.status(fixed.status).json({ success: false, message: fixed.message, code: err.code });
            }
            return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
        }
        // 409는 이메일·닉네임 중복 문구만 그대로, 다른 409는 500
        const DUPLICATE_MESSAGES = new Set([
            "이미 사용 중인 이메일입니다.",
            "이미 사용 중인 닉네임입니다.",
        ]);
        const rawStatus = err.status || err.statusCode;
        if (rawStatus === 409) {
            if (typeof err.message === 'string' && DUPLICATE_MESSAGES.has(err.message)) {
                return res.status(409).json({ success: false, message: err.message });
            }
            return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
        }
        // 그 밖은 400이면 INVALID_INPUT, 아니면 500
        const status = rawStatus === 400 ? 400 : 500;
        const code = status === 400 ? 'INVALID_INPUT' : 'SERVER_ERROR';
        return res.status(status).json({ ok: false, code });
    }

    // 비번 재설정: 캐시 금지, 400·404(없는 경로)·500 코드만
    const resetRequestPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (resetRequestPath.startsWith('/auth/password-reset')) {
        res.set('Cache-Control', 'no-store');
        const rawStatus = err.status || err.statusCode;
        const status = rawStatus === 400 ? 400 : (rawStatus === 404 ? 404 : 500);
        const code = status === 400 ? 'INVALID_INPUT' : (status === 404 ? 'INVALID' : 'SERVER_ERROR');
        return res.status(status).json({ ok: false, code });
    }

    // 충전·골드 구매 경로: 캐시 금지, 정한 코드·문구만 (결제 내부 문구·비밀 값 안 보이기)
    const topupScopedPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    const isTopupScope = topupScopedPath === '/economy/currency-products'
        || topupScopedPath === '/economy/topup'
        || topupScopedPath.startsWith('/economy/topup/')
        || topupScopedPath === '/economy/gold-purchases';
    if (isTopupScope) {
        res.set('Cache-Control', 'no-store');
        // 내보내도 되는 코드와 그 상태·문구
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
        // 상품 바뀜 응답에 붙일 공개 필드와 타입 (다른 필드는 안 붙임)
        const PUBLIC_PRODUCT_FIELDS = {
            productId: 'string', kind: 'string', displayName: 'string', payCurrency: 'string',
            payAmount: 'number', grantCurrency: 'string', grantAmount: 'number', bonusAmount: 'number', version: 'number',
        };
        // 필드 하나라도 타입 다르면 상품 안 붙임
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

        // 로그인 오류: 만료면 refresh 받게 코드 붙임
        if (rawStatus === 401) {
            if (rawCode === 'ACCESS_TOKEN_EXPIRED') {
                return res.status(401).json({ success: false, message: '액세스 토큰이 만료되었습니다.', code: 'ACCESS_TOKEN_EXPIRED' });
            }
            return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
        }
        // 코드 없는 403: 정지면 사유 빼고 문구만
        if (rawStatus === 403 && !rawCode) {
            const banned = typeof err.message === 'string' && err.message.startsWith('정지된 계정입니다.');
            return res.status(403).json({ success: false, message: banned ? '정지된 계정입니다.' : '접근 권한이 없습니다.' });
        }
        if (rawCode === 'ECONOMY_FORBIDDEN') {
            return res.status(403).json({ ok: false, code: 'ECONOMY_FORBIDDEN', message: '다른 계정의 경제 데이터에 접근할 수 없습니다.' });
        }
        // 표에 있는 코드면 그 상태·문구, 결제 확인 중이면 2초 뒤 다시 보라고 알림
        const fixed = rawCode && Object.hasOwn(TOPUP_SCOPED_ERRORS, rawCode) ? TOPUP_SCOPED_ERRORS[rawCode] : undefined;
        if (fixed) {
            if (rawCode === 'PAYMENT_PROCESSING') res.set('Retry-After', '2');
            const body = { ok: false, code: rawCode, message: fixed.message };
            // 상품 바뀜이면 지금 상품을 붙여 화면이 새 값으로 다시 묻게 함
            if (rawCode === 'PRODUCT_VERSION_MISMATCH') {
                const product = publicProductOf(err.currentProduct);
                if (product) body.product = product;
            }
            return res.status(fixed.status).json(body);
        }
        // 코드 없는 400·404는 공통 문구
        if (!rawCode && rawStatus === 400) {
            return res.status(400).json({ ok: false, code: 'INVALID_INPUT', message: '요청 형식이 올바르지 않습니다.' });
        }
        if (!rawCode && rawStatus === 404) {
            return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '요청한 경로를 찾을 수 없습니다.' });
        }
        // 나머지는 500, 로그에도 방법만 찍음 (오류 내용에 섞인 비밀 값 안 남기기)
        console.error(`[economy-topup] SERVER_ERROR ${req.method}`);
        return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: '서버 내부에서 에러가 발생했습니다.' });
    }

    // 범위 밖 오류: 스택 빨간 글씨 로그 + 문구·코드 그대로, 스택은 운영 아닐 때만 응답에
    console.error('\x1b[31m%s\x1b[0m', err.stack);

    const statusCode = err.status || err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || '서버 내부에서 에러가 발생했습니다.',
        code: err.code,
        error: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
};
