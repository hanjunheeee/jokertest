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
        await userRepository.updateUser(req.user.uuid, { nickname: nickname.trim() });
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

        const user = await userRepository.findByUuid(req.user.uuid);
        const isMatch = await comparePassword(currentPassword, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: "현재 비밀번호가 올바르지 않습니다." });
        }

        const password_hash = await hashPassword(newPassword);
        await userRepository.updateUser(req.user.uuid, { password_hash });
        res.status(200).json({ success: true, message: "비밀번호가 변경되었습니다." });
    } catch (error) {
        next(error);
    }
};
