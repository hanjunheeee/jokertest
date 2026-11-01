// 내 프로필 파일, 프로필 응답 만들기(직업 통계로 승률·최고 승률 직업 이름) · 닉네임 바꾸기(검사·중복 확인) + 계정 한 명 읽기
// profile 컨트롤러·관리자 확인·방 입장이 부름, 상태 코드·응답 감싸기는 컨트롤러 몫 (저장소·전적 통계 서비스는 모듈 객체로 불러 시험 패치 먹게)
const userRepository            = require("../../repositories/user");
const roleStatisticsQueries     = require("../game/roleStatistics/queries");
const roleStatisticsPolicy      = require("../game/roleStatistics");
const { validateNickname }      = require("../../validations/auth/signup");

// 프로필 행 없으면 null, 있으면 응답 data 객체 (조회 순서: 프로필 → 최고 승률 직업 → 직업 통계)
exports.getMyProfile = async (uuid) => {
    const row = await userRepository.getMyProfile(uuid);
    if (!row) return null;

    const stats = row.UserStat ?? {};
    const highestWinRateRole = await roleStatisticsQueries.getHighestWinRateRole(uuid);

    const roleStatistics = await roleStatisticsQueries.getMyRoleStatistics(uuid);
    let displayedGames = 0;
    let displayedWins  = 0;
    for (const entry of roleStatistics) {
        displayedGames += entry.games ?? 0;
        displayedWins  += entry.wins  ?? 0;
    }
    const accountWinRate = displayedGames > 0 ? displayedWins / displayedGames : 0;

    return {
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
    };
};

// 검사 실패 400 · 남이 쓰는 닉네임 409 → { ok: false, status, message }, 저장하면 { ok: true }
exports.changeNickname = async (uuid, nickname) => {
    const nicknameResult = validateNickname(nickname);
    if (!nicknameResult.ok) {
        return { ok: false, status: 400, message: nicknameResult.message };
    }
    const normalizedNickname = nicknameResult.value;
    const existingUser = await userRepository.findByNickname(normalizedNickname);
    if (existingUser && existingUser.uuid !== uuid) {
        return { ok: false, status: 409, message: "이미 사용 중인 닉네임입니다." };
    }

    await userRepository.updateUser(uuid, { nickname: normalizedNickname });
    return { ok: true };
};

// 계정 한 명 읽기 (방 입장·관리자 확인용), 저장소 index 객체로 불러 시험 갈아끼우기 먹게
// async 안 붙임: 저장소 Promise 그대로 돌려줘 마이크로태스크 한 칸 안 늘림 (matchmaking 경합 시험 순서 지키기)
exports.findByUuid = (...args) => userRepository.findByUuid(...args);
