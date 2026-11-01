// 비번 바꾸기 파일, 잠금 → 현재 비번 비교 → 해시 → 저장 → 세션 끊기 (트랜잭션 하나)
// profile 컨트롤러가 입력 검사 뒤 부름, 응답 문구·상태는 컨트롤러 몫 (저장소는 모듈 객체로 불러 시험 패치 먹게)
const userRepository = require("../../../repositories/user");
const { comparePassword,
        hashPassword } = require("../../../utils/auth/credentials");

// 현재 비번 틀리면 { ok: false }, 맞으면 새 해시 저장 + 온라인 세션 끊고 { ok: true }
// 해시는 검사 결과 .value 아닌 newPassword 원문 그대로 씀 (옮기기 전 동작 그대로)
exports.changePassword = async ({ uuid, currentPassword, newPassword }) => {
    const outcome = await userRepository.withTransaction(async (transaction) => {
        const user = await userRepository.findByUuid(uuid, { transaction, lock: transaction.LOCK.UPDATE });
        const isMatch = await comparePassword(currentPassword, user.password_hash);
        if (!isMatch) return { ok: false };

        const password_hash = await hashPassword(newPassword);
        await userRepository.updateUser(uuid, { password_hash }, { transaction });
        await userRepository.markOnlineSessionsOffline(uuid, { transaction });
        return { ok: true };
    });
    return outcome;
};
