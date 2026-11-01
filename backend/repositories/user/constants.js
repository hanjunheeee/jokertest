// 사용자 저장소 상수 파일, 유일 충돌 문구표 · 기본 통계 값
// 충돌 오류 바꾸기·프로필 읽기가 씀

// 유일 제약에 걸린 컬럼마다 사용자에게 보일 문구
const UNIQUE_CONFLICTS = [
    { field: "nickname", message: "이미 사용 중인 닉네임입니다." },
    { field: "email",    message: "이미 사용 중인 이메일입니다." },
    { field: "provider_subject", message: "이미 연결된 소셜 계정입니다." },
];

// 통계 행이 없을 때 보여 줄 기본값
const STATS_DEFAULTS = {
    title:            '신참',
    total_games:      0,
    survival_count:   0,
    execution_count:  0,
    most_played_role: null,
};

module.exports = {
    UNIQUE_CONFLICTS,
    STATS_DEFAULTS,
};
