// 내 프로필 파일, 프로필 응답(직업 통계로 승률·최고 승률 직업 이름) · 닉네임 바꾸기(검사·중복 확인) · 계정 한 명 읽기
// controllers/profile.controller.js·middlewares/economyAccess.middleware.js·socket/matchmaking/core/deps.js가 부름
// 응답 감싸기는 컨트롤러 몫, 저장소·전적 통계 서비스는 모듈 객체로 불러 시험 패치 먹게
const userRepository            = require("../repositories/user");
const roleStatisticsQueries     = require("./game/roleStatistics/queries");
const roleStatisticsPolicy      = require("./game/roleStatistics");
const { validateNickname }      = require("../validations/auth/signup");
const bannedWords               = require("./ops/bannedWords");

// 프로필 행 없으면 null, 있으면 응답 data 객체 (조회 순서: 프로필 → 최고 승률 직업 → 직업 통계)
exports.getMyProfile = async (uuid) => {
    // 계정 없으면 null, 컨트롤러가 404
    const row = await userRepository.getMyProfile(uuid);
    if (!row) return null;

    // 통계 행 없는 계정은 기본값으로
    const stats = row.UserStat ?? {};
    const highestWinRateRole = await roleStatisticsQueries.getHighestWinRateRole(uuid);

    // 승률만 직업 통계 합으로 (user_stats엔 이긴 수 칸이 없음)
    const roleStatistics = await roleStatisticsQueries.getMyRoleStatistics(uuid);
    let roleGames = 0;
    let roleWins  = 0;
    for (const entry of roleStatistics) {
        roleGames += entry.games ?? 0;
        roleWins  += entry.wins  ?? 0;
    }
    const accountWinRate = roleGames > 0 ? roleWins / roleGames : 0;

    // 판 수·생존·처형·많이 한 직업은 전부 user_stats 기준 (사용자 결정), 최고 승률 직업은 한글 이름
    return {
        nickname:          row.nickname,
        profile_image_url: row.profile_image_url,
        total_games:       stats.total_games      ?? 0,
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
    // 가입 때와 같은 닉네임 규칙
    const nicknameResult = validateNickname(nickname);
    if (!nicknameResult.ok) {
        return { ok: false, status: 400, message: nicknameResult.message };
    }
    // 내 지금 닉네임과 같으면 통과, 남이 쓰면 거절
    const normalizedNickname = nicknameResult.value;
    // 금지어 든 닉네임 거절 (금지어 표 비면 안 막음)
    if (bannedWords.containsBannedWord(normalizedNickname)) {
        return { ok: false, status: 400, code: "NICKNAME_BANNED_WORD", message: "사용할 수 없는 단어가 들어간 닉네임입니다." };
    }
    const existingUser = await userRepository.findByNickname(normalizedNickname);
    if (existingUser && existingUser.uuid !== uuid) {
        return { ok: false, status: 409, message: "이미 사용 중인 닉네임입니다." };
    }

    // 여기부터 진짜 바뀜: 정리된 닉네임 저장
    await userRepository.updateUser(uuid, { nickname: normalizedNickname });
    return { ok: true };
};

// 계정 한 명 읽기 (방 입장·관리자 확인용), 저장소 index 객체로 불러 시험 갈아끼우기 먹게
// async 안 붙임: 저장소 Promise 그대로 돌려줘 마이크로태스크 한 칸 안 늘림 (matchmaking 경합 시험 순서 지키기)
exports.findByUuid = (...args) => userRepository.findByUuid(...args);
