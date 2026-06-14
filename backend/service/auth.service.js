/**
 * @file    auth.service.js
 * @desc    회원가입 · 로그인의 비즈니스 로직을 담당하는 서비스 계층입니다.
 *          컨트롤러로부터 받은 입력값을 검증·가공하고 DB 접근은 user.repositories.js에만 위임합니다.
 */

const userRepository            = require("../repositories/user.repositories");
const { hashPassword,
        comparePassword }       = require("../utils/hash");
const { generateToken }         = require("../utils/jwt");
const crypto                    = require("crypto");
const db                        = require("../models");

// ──────────────────────────────────────────────
// 회원가입
// ──────────────────────────────────────────────

/**
 * @desc    신규 유저 회원가입 비즈니스 로직
 *          이메일 중복 검사 → 비밀번호 해싱 → DB 저장 순으로 처리됩니다.
 *          로그인 식별자는 이메일 하나로만 관리하며 별도 login_id 필드는 없습니다.
 *
 * @param   {Object} UserData            - 클라이언트가 보낸 가입 정보
 * @param   {string} UserData.email      - 가입할 이메일 주소
 * @param   {string} UserData.password   - 평문 비밀번호 (서비스에서 해싱)
 * @param   {string} UserData.nickname   - 사용할 닉네임
 * @returns {Promise<Object>} 생성된 User Sequelize 인스턴스
 * @throws  {Error} "이미 사용 중인 이메일입니다." — 중복 이메일
 */
exports.signup = async (UserData) => {
    const { email, password, nickname } = UserData;

    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
        throw new Error("이미 사용 중인 이메일입니다.");
    }

    const password_hash = await hashPassword(password);

    return await userRepository.createUser({ email, password_hash, nickname });
};

// ──────────────────────────────────────────────
// 로그인
// ──────────────────────────────────────────────

/**
 * @desc    로그인 비즈니스 로직
 *          아래 순서로 처리되며, 각 단계에서 실패하면 에러를 throw합니다:
 *            1) 이메일로 유저 존재 여부 확인
 *            2) 계정 잠금 상태 확인 (5회 오입력 시 15분 잠금)
 *            3) 활성 정지(Ban) 내역 확인
 *            4) 비밀번호 일치 여부 검증
 *            5) 로그인 이력 기록 (성공/실패 모두)
 *            6) 성공 시: 실패 카운트 초기화, 기존 세션 오프라인 처리, 새 세션 발급, JWT 생성
 *
 * @param   {Object} loginData           - 클라이언트가 입력한 로그인 정보
 * @param   {string} loginData.email     - 이메일 주소
 * @param   {string} loginData.password  - 평문 비밀번호
 * @param   {Object} reqInfo             - 클라이언트 접속 환경 정보
 * @param   {string} reqInfo.ip          - 클라이언트 IP (ip.js 유틸로 추출)
 * @param   {string} reqInfo.userAgent   - 원본 User-Agent 문자열
 * @param   {string} reqInfo.deviceType  - 파싱된 기기 종류 (PC / MOBILE / TABLET)
 * @returns {Promise<{ user: Object, token: string }>} 검증 완료된 유저 객체와 JWT 문자열
 * @throws  {Error} 유저 없음 / 계정 잠금 / 계정 정지 / 비밀번호 불일치
 */
exports.login = async (loginData, reqInfo) => {
    const { email, password } = loginData;

    // 1) 유저 존재 확인
    const user = await userRepository.findByEmail(email);
    if (!user) {
        throw new Error("가입되지 않은 이메일입니다.");
    }

    // 2) 계정 잠금 확인 (5회 오입력 페널티)
    if (user.locked_until && user.locked_until > new Date()) {
        throw new Error("비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.");
    }

    // 3) 활성 정지 내역 확인
    const activeBan = await userRepository.checkActiveBan(user.uuid);
    if (activeBan) {
        const banReason = activeBan.reason || "운영정책 위반";
        throw new Error(`정지된 계정입니다. 사유: ${banReason}`);
    }

    // 4) 비밀번호 검증
    const isMatch = await comparePassword(password, user.password_hash);

    // 5) 로그인 이력 기록 (성공/실패 무관하게 항상 저장)
    await userRepository.createLoginHistory({
        user_id:    user.uuid,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        success:    isMatch,
    });

    // 비밀번호 불일치 처리
    if (!isMatch) {
        const failCount   = user.failed_login_count + 1;
        // 5회 이상 실패 시 15분 잠금
        const lockedUntil = failCount >= 5
            ? new Date(Date.now() + 15 * 60 * 1000)
            : null;

        await userRepository.updateUser(user.uuid, {
            failed_login_count: failCount,
            locked_until:       lockedUntil
        });

        if (lockedUntil) {
            throw new Error("비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.");
        }
        throw new Error(`비밀번호가 일치하지 않습니다. (틀린 횟수: ${failCount}/5)`);
    }

    // 6-a) 로그인 성공 — 실패 카운트 초기화 및 마지막 접속일 갱신
    await userRepository.updateUser(user.uuid, {
        failed_login_count: 0,
        locked_until:       null,
        last_login_at:      new Date()
    });

    // 6-b) 기존 켜져 있는 세션을 모두 오프라인 처리 (다중 접속 방지)
    await db.UserSession.update(
        { is_online: false },
        { where: { user_id: user.uuid, is_online: true } }
    );

    // 6-c) 새 세션 생성
    const sessionId = crypto.randomUUID();
    await userRepository.createUserSession({
        id:         sessionId,
        user_id:    user.uuid,
        ip_address: reqInfo.ip,
        is_online:  true
    });

    // 6-d) JWT 발급 — HttpOnly 쿠키로 클라이언트에 전달 (컨트롤러에서 처리)
    const token = generateToken({
        uuid:      user.uuid,
        role:      user.role,
        sessionId: sessionId
    });

    return { user, token };
};
