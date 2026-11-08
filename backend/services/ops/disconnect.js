'use strict';

// 즉시 끊기 파일, 관리자 서버가 정지·비활성 처리한 사람의 접속을 바로 끊음 (주기 검사 5초 안 기다림)
// 내부 API POST /internal/users/:uuid/disconnect가 부름, 정지·상태는 DB를 다시 봐서 code 고름
const { createError } = require('../../utils/appError');

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// 끊을 때 실을 code·문구
const DISCONNECT_REASONS = Object.freeze({
    ACCOUNT_BANNED: '정지된 계정입니다. 운영정책을 확인해주세요.',
    ACCOUNT_INACTIVE: '사용할 수 없는 계정입니다.',
    ADMIN_DISCONNECT: '운영자에 의해 연결이 종료되었습니다.',
});

const emitter = require('../../socket/emitter');

const defaultDeps = () => ({
    getIo: emitter.getIo,
    userRepository: require('../../repositories/user'),
});

// 그 사람 소켓 전부 = 계정 채널 소켓 (같은 계정 옛 탭까지, 서버 여러 대면 다른 서버 것도)
const socketsOf = (io, uuid) => emitter.fetchUserSockets(uuid, io);

// 왜 끊는지: 정지 → 상태 ACTIVE 아님 → 그 밖 (DB 다시 봄, 관리자 서버 말만 믿지 않음)
const resolveReason = async (uuid, userRepository) => {
    const ban = await userRepository.checkActiveBan(uuid);
    if (ban) return 'ACCOUNT_BANNED';
    const user = await userRepository.findByUuid(uuid);
    if (user && user.status && user.status !== 'ACTIVE') return 'ACCOUNT_INACTIVE';
    return 'ADMIN_DISCONNECT';
};

// 끊기: 정지·비활성이면 세션도 내림 (새로고침으로 다시 못 들어오게), 접속 없으면 끊은 수 0
const disconnectUser = async (uuid, deps = defaultDeps()) => {
    if (typeof uuid !== 'string' || !UUID_PATTERN.test(uuid)) {
        throw createError('uuid 모양이 아닙니다.', 400, 'INVALID_UUID');
    }
    const code = await resolveReason(uuid, deps.userRepository);
    if (code !== 'ADMIN_DISCONNECT') {
        await deps.userRepository.markOnlineSessionsOffline(uuid);
    }
    const sockets = await socketsOf(deps.getIo(), uuid);
    for (const socket of sockets) {
        try {
            socket.emit('force_disconnect', { code, message: DISCONNECT_REASONS[code] });
            socket.disconnect(true);
        } catch (error) {
            console.error('[즉시 끊기 실패]', error?.name ?? 'Error');
        }
    }
    return { uuid, code, disconnected: sockets.length };
};

module.exports = { DISCONNECT_REASONS, disconnectUser };
