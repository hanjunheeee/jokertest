const { createError } = require("../utils/appError");

exports.notFoundHandler = (req, res, next) => {
    next(createError(`${req.method} ${req.url} 라우터를 찾을 수 없습니다.`, 404));
};

exports.globalErrorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    const findIdRequestPath = String(req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '');
    if (findIdRequestPath === '/auth/find-id') {
        const status = (err.status || err.statusCode) === 400 ? 400 : 500;
        const code = status === 400 ? 'INVALID_INPUT' : 'SERVER_ERROR';
        return res.status(status).json({ ok: false, code });
    }

    const SIGNUP_SCOPED_ERRORS = {
        SIGNUP_PROOF_REQUIRED: { status: 401, message: '이메일 인증이 필요합니다.' },
        SIGNUP_PROOF_INVALID: { status: 401, message: '이메일 인증 증명이 유효하지 않습니다.' },
    };
    const signupScopedPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (signupScopedPath.startsWith('/auth/signup')) {
        res.set('Cache-Control', 'no-store');
        if (typeof err.code === 'string' && err.code) {
            const fixed = SIGNUP_SCOPED_ERRORS[err.code];
            if (fixed) {
                return res.status(fixed.status).json({ success: false, message: fixed.message, code: err.code });
            }
            return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
        }
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
        const status = rawStatus === 400 ? 400 : 500;
        const code = status === 400 ? 'INVALID_INPUT' : 'SERVER_ERROR';
        return res.status(status).json({ ok: false, code });
    }

    const resetRequestPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (resetRequestPath.startsWith('/auth/password-reset')) {
        res.set('Cache-Control', 'no-store');
        const rawStatus = err.status || err.statusCode;
        const status = rawStatus === 400 ? 400 : (rawStatus === 404 ? 404 : 500);
        const code = status === 400 ? 'INVALID_INPUT' : (status === 404 ? 'INVALID' : 'SERVER_ERROR');
        return res.status(status).json({ ok: false, code });
    }

    const topupScopedPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
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
        if (rawStatus === 403 && !rawCode) {
            const banned = typeof err.message === 'string' && err.message.startsWith('정지된 계정입니다.');
            return res.status(403).json({ success: false, message: banned ? '정지된 계정입니다.' : '접근 권한이 없습니다.' });
        }
        if (rawCode === 'ECONOMY_FORBIDDEN') {
            return res.status(403).json({ ok: false, code: 'ECONOMY_FORBIDDEN', message: '다른 계정의 경제 데이터에 접근할 수 없습니다.' });
        }
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
