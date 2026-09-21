const userRepository            = require("../repositories/user.repositories");
const gameResultRepository      = require("../repositories/gameResult.repositories");
const roleStatisticsPolicy      = require("../services/roleStatisticsPolicy");
const { comparePassword,
        hashPassword }          = require("../utils/hash");
const { validateNickname,
        validatePassword }      = require("../validation/signupValidation");

exports.getMyProfile = async (req, res, next) => {
    try {
        const row = await userRepository.getMyProfile(req.user.uuid);
        if (!row) return res.status(404).json({ success: false, message: "유저를 찾을 수 없습니다." });

        const stats = row.UserStat ?? {};
        // F-10 AC-04/A-11: most_played_role(최다 플레이)과는 의미가 다른 별도 필드다 —
        // 기존 필드는 값도 계산 방식도 그대로 두고, "운명의 가면"이 쓸 최고 승률 직업만
        // 새로 얹는다. 대상이 없으면(전적 0판) null을 그대로 내려보낸다(더미로 대체하지 않는다).
        const highestWinRateRole = await gameResultRepository.getHighestWinRateRole(req.user.uuid);

        // F-30 AC-02: 화면에 보이는 **전체 판수와 승률은 같은 모집단**에서 나와야 한다. 예전
        // total_games는 UserStats의 누적 증분이었고 승률은 아예 없었으므로, 둘을 나란히 두면
        // "판수는 저쪽 집계, 승률은 이쪽 집계"가 되어 사용자가 검산할 수 없는 숫자가 된다.
        //
        // 그래서 기존 직업 전적 조회(getMyRoleStatistics) 하나의 반환값에서 games·wins를 각각
        // 합산해 둘 다 만든다 — 인증 계정 조건·won not null·GameResult required JOIN·개발 경기
        // 제외라는 이미 검증된 게이트를 그대로 물려받는다(A-01). 특정 직업의 최고 승률이 아니라
        // 계정 전체 승수/판수다(시민 1승/2판 + 광대 1승/1판 = 3판·2/3이지, 100%도 75%도 아니다).
        //
        // 원본 UserStats.total_games는 이 응답이 읽지도 쓰지도 않는다 — 업적·랭킹·가면이 쓰는
        // 원본 집계는 그대로 남는다(AC-05).
        const roleStatistics = await gameResultRepository.getMyRoleStatistics(req.user.uuid);
        let displayedGames = 0;
        let displayedWins  = 0;
        for (const entry of roleStatistics) {
            displayedGames += entry.games ?? 0;
            displayedWins  += entry.wins  ?? 0;
        }
        // 0판 계정은 0으로 나누지 않고 명시적으로 0이다(화면이 0.0%로 표시한다, AC-03).
        const accountWinRate = displayedGames > 0 ? displayedWins / displayedGames : 0;

        res.status(200).json({
            success: true,
            data: {
                nickname:          row.nickname,
                profile_image_url: row.profile_image_url,
                title:             stats.title            ?? '신참',
                total_games:       displayedGames,
                // 반올림하지 않은 원시 비율이다 — 표시 단계(프런트)에서만 자리수를 정한다.
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
        // 가입(F0573/F0541)과 같은 길이·허용 문자 기준을 재사용한다 — 두 경로가
        // 서로 다른 닉네임을 허용하면 가입 때는 막혔던 값이 변경으로는 통과하게 된다.
        const nicknameResult = validateNickname(nickname);
        if (!nicknameResult.ok) {
            return res.status(400).json({ success: false, message: nicknameResult.message });
        }
        const normalizedNickname = nicknameResult.value;
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
        // 가입(F0542)과 같은 길이·bcrypt 72바이트 기준을 재사용한다 — 이 검사 없이 해시로
        // 넘기면 bcrypt가 72바이트를 넘는 부분을 조용히 잘라, 사용자가 입력한 값과 실제로
        // 인증에 쓰이는 값이 달라진다. 트랜잭션을 열기 전에 거부하므로 해시·세션 모두 그대로 남는다.
        const newPasswordResult = validatePassword(newPassword);
        if (!newPasswordResult.ok) {
            return res.status(400).json({ success: false, message: newPasswordResult.message });
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
