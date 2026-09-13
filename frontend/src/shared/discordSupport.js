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
// F-18 AC-03: 이제 로비 왼쪽 메뉴의 고객센터 버튼이 실제로 이 판정 결과를 목적지로 쓴다
// (useLobbyMenuNav.js → LobbyMenuNav.jsx). 그래서 "호스트만 Discord면 통과"로는 부족하다 —
// 같은 호스트 안에도 지원과 무관한 경로(OAuth 인가 화면 등)가 있고, 그런 주소를 고객센터
// 버튼에 그대로 실으면 사용자를 지원 채널이 아니라 권한 승인 화면으로 보내게 된다. 허용
// 경로를 초대(discord.gg/<code>, discord.com/invite/<code>)와 서버 지원 채널
// (discord.com/channels/<serverId>/<channelId>)로 한정한다.
const DISCORD_INVITE_SHORT_HOST = "discord.gg";
const DISCORD_APP_HOSTS = new Set(["discord.com", "www.discord.com"]);

/** 초대 코드에 쓰이는 문자만 허용한다 — 경로 구분자·인코딩 트릭이 섞인 값은 거부한다. */
const isInviteCode = (segment) => /^[A-Za-z0-9-]+$/.test(segment ?? "");

/** Discord의 서버/채널 id는 snowflake(10진 숫자)다. */
const isSnowflake = (segment) => /^\d+$/.test(segment ?? "");

function isAllowedSupportPath(url) {
    // 빈 구간("//a", 끝 슬래시)을 먼저 걷어내 "/invite//x" 같은 불완전 경로를 거부한다.
    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
    const rawSegments = url.pathname.split("/").slice(1);
    if (rawSegments.some((segment, index) => segment.length === 0 && index < rawSegments.length - 1)) {
        return false;
    }

    if (url.hostname === DISCORD_INVITE_SHORT_HOST) {
        // discord.gg/<초대코드> 하나만 허용한다(코드가 비어 있으면 초대가 아니다).
        return segments.length === 1 && isInviteCode(segments[0]);
    }

    if (segments[0] === "invite") {
        return segments.length === 2 && isInviteCode(segments[1]);
    }

    if (segments[0] === "channels") {
        return segments.length === 3 && isSnowflake(segments[1]) && isSnowflake(segments[2]);
    }

    // /oauth2/authorize 등 그 밖의 모든 경로는 지원 목적지가 아니다.
    return false;
}

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

    // "https://evil.example.com@discord.gg/x"처럼 사용자정보로 실제 목적지를 감추는 형태는
    // 호스트 검사만으로는 걸러지지 않는다 — 사용자정보가 붙은 값 자체를 거부한다.
    if (url.username || url.password) {
        return null;
    }

    // 비표준 포트(https 기본 포트가 아닌 값)는 지원 목적지가 아니다. URL은 기본 포트(443)를
    // 빈 문자열로 정규화하므로, 남아 있으면 명시적으로 다른 포트를 지정한 것이다.
    if (url.port) {
        return null;
    }

    if (url.hostname !== DISCORD_INVITE_SHORT_HOST && !DISCORD_APP_HOSTS.has(url.hostname)) {
        return null;
    }

    if (!isAllowedSupportPath(url)) {
        return null;
    }

    return url.toString();
}
