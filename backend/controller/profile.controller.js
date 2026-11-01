const userRepository            = require("../repositories/user.repositories");
const gameResultRepository      = require("../repositories/gameResult.repositories");
const roleStatisticsPolicy      = require("../services/game/roleStatistics");
const { comparePassword,
        hashPassword }          = require("../utils/hash");
const { validateNickname,
        validatePassword }      = require("../validation/signupValidation");

exports.getMyProfile = async (req, res, next) => {
    try {
        const row = await userRepository.getMyProfile(req.user.uuid);
        if (!row) return res.status(404).json({ success: false, message: "유저를 찾을 수 없습니다." });

        const stats = row.UserStat ?? {};
        const highestWinRateRole = await gameResultRepository.getHighestWinRateRole(req.user.uuid);

        const roleStatistics = await gameResultRepository.getMyRoleStatistics(req.user.uuid);
        let displayedGames = 0;
        let displayedWins  = 0;
        for (const entry of roleStatistics) {
            displayedGames += entry.games ?? 0;
            displayedWins  += entry.wins  ?? 0;
        }
        const accountWinRate = displayedGames > 0 ? displayedWins / displayedGames : 0;

        res.status(200).json({
            success: true,
            data: {
                nickname:          row.nickname,
                profile_image_url: row.profile_image_url,
                title:             stats.title            ?? '신참',
                total_games:       displayedGames,
                account_win_rate:  accountWinRate,
                survival_count:    stats.survival_count   ?? 0,
                execution_count:   stats.execution_count  ?? 0,
                most_played_role:  stats.most_played_role ?? null,
                highest_win_rate_role: highestWinRateRole
                    ? roleStatisticsPolicy.getRoleKoreanName(highestWinRateRole.role)
                    : null,
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.updateNickname = async (req, res, next) => {
    try {
        const { nickname } = req.body;
        const nicknameResult = validateNickname(nickname);
        if (!nicknameResult.ok) {
            return res.status(400).json({ success: false, message: nicknameResult.message });
        }
        const normalizedNickname = nicknameResult.value;
        const existingUser = await userRepository.findByNickname(normalizedNickname);
        if (existingUser && existingUser.uuid !== req.user.uuid) {
            return res.status(409).json({ success: false, message: "이미 사용 중인 닉네임입니다." });
        }

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
        const newPasswordResult = validatePassword(newPassword);
        if (!newPasswordResult.ok) {
            return res.status(400).json({ success: false, message: newPasswordResult.message });
        }

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
