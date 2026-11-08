// 화면 주소별 하단 배너 보임 여부 (게임 바깥 화면만 허용 목록으로)
// MobileShell이 씀, 새 화면은 목록에 넣기 전까지 배너 없음

// 배너 보이는 화면: 로비·모드·방 목록·방 만들기·대기방·마이페이지·상점·서고·설정·결과
export const BANNER_PATHS = Object.freeze([
    "/lobby",
    "/gameMode",
    "/multiplay",
    "/roomInvite",
    "/game-setup",
    "/game-matching",
    "/mypage",
    "/mypage/emoticons",
    "/account",
    "/store",
    "/library",
    "/setting",
    "/gameresult",
])

// 끝 빗금 하나는 같은 주소로 봄 ("/lobby/" → "/lobby")
const trimSlash = (path) => (path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path)

// 주소 → 배너 보이나 (인게임·로그인·가입·계정 찾기·개발 미리보기는 목록에 없어서 false)
export function shouldShowBanner(pathname) {
    if (typeof pathname !== "string" || pathname.length === 0) return false
    return BANNER_PATHS.includes(trimSlash(pathname))
}
