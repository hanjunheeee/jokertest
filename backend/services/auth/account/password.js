// 비번 바꾸기 파일, 잠금 → 현재 비번 비교 → 해시 → 저장 → 세션 끊기 (트랜잭션 하나)
// controllers/profile.controller.js가 입력 검사 뒤 account 입구로 부름, 응답 문구·상태는 컨트롤러 몫
// 저장소는 모듈 객체로 불러 시험 패치 먹게
const userRepository = require("../../../repositories/user");
const { comparePassword,
        hashPassword } = require("../../../utils/auth/credentials");

// 현재 비번 틀리면 { ok: false }, 맞으면 새 해시 저장 + 온라인 세션 끊고 { ok: true }
// 해시는 검사 결과 .value 아닌 newPassword 원문 그대로 씀 (지금 검사기는 같은 값 돌려줌)
exports.changePassword = async ({ uuid, currentPassword, newPassword }) => {
    const outcome = await userRepository.withTransaction(async (transaction) => {
        // 같은 계정 동시 바꾸기 겹치지 않게 행 잠금
        const user = await userRepository.findByUuid(uuid, { transaction, lock: transaction.LOCK.UPDATE });
        const isMatch = await comparePassword(currentPassword, user.password_hash);
        if (!isMatch) return { ok: false };

        // 여기부터 진짜 바뀜: 새 해시 저장, 지금 세션 포함 전부 끊어 다시 로그인하게
        const password_hash = await hashPassword(newPassword);
        await userRepository.updateUser(uuid, { password_hash }, { transaction });
        await userRepository.markOnlineSessionsOffline(uuid, { transaction });
        return { ok: true };
    });
    return outcome;
};
