const userRepository            = require("../repositories/user.repositories");
const { comparePassword,
        hashPassword }          = require("../utils/hash");

exports.getMyProfile = async (req, res, next) => {
    try {
        const row = await userRepository.getMyProfile(req.user.uuid);
        if (!row) return res.status(404).json({ success: false, message: "유저를 찾을 수 없습니다." });

        const stats = row.UserStat ?? {};

        res.status(200).json({
            success: true,
            data: {
                nickname:          row.nickname,
                profile_image_url: row.profile_image_url,
                reputation:        stats.reputation       ?? 0,
                title:             stats.title            ?? '신참',
                total_games:       stats.total_games      ?? 0,
                survival_count:    stats.survival_count   ?? 0,
                execution_count:   stats.execution_count  ?? 0,
                most_played_role:  stats.most_played_role ?? null,
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.updateNickname = async (req, res, next) => {
    try {
        const { nickname } = req.body;
        if (!nickname?.trim()) {
            return res.status(400).json({ success: false, message: "닉네임을 입력해주세요." });
        }
        const normalizedNickname = nickname.trim();
        const existingUser = await userRepository.findByNickname(normalizedNickname);
        if (existingUser && existingUser.uuid !== req.user.uuid) {
            return res.status(409).json({ success: false, message: "이미 사용 중인 닉네임입니다." });
        }

        // 사전 조회 뒤의 동시 요청 경합은 repository가 unique 오류를 같은 409로 정규화한다.
        await userRepository.updateUser(req.user.uuid, { nickname: normalizedNickname });
        res.status(200).json({ success: true, message: "닉네임이 변경되었습니다." });
    } catch (error) {
        next(error);
    }
};

exports.updatePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "현재 비밀번호와 새 비밀번호를 입력해주세요." });
        }

        // 현재 비밀번호 확인부터 세션 전체 폐기까지 하나의 트랜잭션 + 유저 행 잠금(FOR UPDATE)
        // 안에서 처리한다. auth.service.js의 login()도 같은 유저 행을 같은 방식(FOR UPDATE)으로
        // 잠그므로, 이 트랜잭션이 진행 중일 때 동시에 들어온 로그인은 커밋될 때까지 대기했다가
        // 최신 password_hash로 비교하게 된다 — "바뀌고 있는 옛 비밀번호로 통과한 로그인이 변경
        // 완료 이후에 새 세션을 만드는" 경합을 막는다(F-03 A-04/R-IMPL #7). 폐기 없이 비밀번호만
        // 바뀌면 변경 전에 이미 발급된 세션(다른 브라우저·탈취된 세션 포함)이 새 비밀번호 발급
        // 이후에도 계속 유효하게 남으므로(F-03 AC-03/AC-04), 확인·변경·전체 폐기를 원자적으로
        // 묶는다. 이 요청 자신의 세션도 함께 폐기되므로 응답 이후 재로그인이 필요하다.
        const outcome = await userRepository.withTransaction(async (transaction) => {
            const user = await userRepository.findByUuid(req.user.uuid, { transaction, lock: transaction.LOCK.UPDATE });
            const isMatch = await comparePassword(currentPassword, user.password_hash);
            if (!isMatch) return { ok: false };

            const password_hash = await hashPassword(newPassword);
            await userRepository.updateUser(req.user.uuid, { password_hash }, { transaction });
            await userRepository.markOnlineSessionsOffline(req.user.uuid, { transaction });
            return { ok: true };
        });

        if (!outcome.ok) {
            return res.status(401).json({ success: false, message: "현재 비밀번호가 올바르지 않습니다." });
        }

        res.status(200).json({ success: true, message: "비밀번호가 변경되었습니다." });
    } catch (error) {
        next(error);
    }
};
