// F-07 AC-05: 고객센터 Discord 초대 URL 검증. env.js가 그대로 노출하는 원시 값
// (VITE_DISCORD_SUPPORT_URL)이 실제로 안전하게 쓸 수 있는 Discord 초대 URL인지 판정하는
// 순수 함수다. 이 파일은 import.meta.env를 참조하지 않으므로(원시 값은 호출부가 인자로
// 넘긴다) Vite 없이 이 저장소의 node:test로 바로 import·실행할 수 있다(env.js 자체를
// import하면 F-03 R-IMPL #6과 같은 이유로 실패한다).
//
// 설정되지 않았으면(undefined/빈 문자열) "사용 불가"로 취급한다 — 추측한 초대 URL을 지어
// 대신 쓰지 않는다. 안전하지 않은 스킴(javascript:/http: 등)이나 Discord 초대 도메인이
// 아닌 목적지도 거부한다 — 이 값은 백엔드 OAuth 앱 자격(DISCORD_CLIENT_ID/
// DISCORD_CLIENT_SECRET/DISCORD_REDIRECT_URI)과는 전혀 다른, 공개돼도 안전한 설정이지만
// 그렇다고 임의의 URL을 그대로 신뢰하지는 않는다(피싱 목적지로 오인될 수 있는 값 차단).
// F18이 로비 Discord 버튼에 이 검증을 연결할 예정이며, 이 슬라이스는 그 버튼을 새로
// 연결하지 않는다(범위 밖) — 검증 헬퍼만 미리 둔다.
const ALLOWED_DISCORD_INVITE_HOSTS = new Set(["discord.gg", "discord.com", "www.discord.com"]);

export function resolveDiscordSupportUrl(rawValue) {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
        return null;
    }

    let url;
    try {
        url = new URL(rawValue.trim());
    } catch {
        return null;
    }

    if (url.protocol !== "https:") {
        return null;
    }
    if (!ALLOWED_DISCORD_INVITE_HOSTS.has(url.hostname)) {
        return null;
    }

    return url.toString();
}
