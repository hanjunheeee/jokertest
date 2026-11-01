// 고객센터 디스코드 주소 검사 (디스코드 초대·채널 주소만 통과)
// lobby 메뉴(useLobbyMenuNav)가 env 값을 넣어 씀
// 짧은 초대 주소와 디스코드 본 주소만 받음
const INVITE_SHORT_HOST = "discord.gg";
const DISCORD_APP_HOSTS = new Set(["discord.com", "www.discord.com"]);

// 초대 코드는 영문·숫자·-만
const isInviteCode = (segment) => /^[A-Za-z0-9-]+$/.test(segment ?? "");

// 서버·채널 id는 숫자만
const isSnowflake = (segment) => /^\d+$/.test(segment ?? "");

// discord.gg/코드, /invite/코드, /channels/서버/채널 모양만 허용
function isAllowedSupportPath(url) {
    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
    const rawSegments = url.pathname.split("/").slice(1);
    // 중간에 빈 칸(//)이 낀 경로는 거절
    if (rawSegments.some((segment, index) => segment.length === 0 && index < rawSegments.length - 1)) {
        return false;
    }

    // discord.gg는 코드 하나만
    if (url.hostname === INVITE_SHORT_HOST) {
        return segments.length === 1 && isInviteCode(segments[0]);
    }

    // 본 주소 초대: /invite/코드
    if (segments[0] === "invite") {
        return segments.length === 2 && isInviteCode(segments[1]);
    }

    // 본 주소 채널: /channels/서버 id/채널 id
    if (segments[0] === "channels") {
        return segments.length === 3 && isSnowflake(segments[1]) && isSnowflake(segments[2]);
    }

    return false;
}

// 틀린 주소면 null, 통과하면 정리된 주소 (env 값을 그대로 링크에 안 넣으려고)
export function resolveDiscordSupportUrl(rawValue) {
    // 비었거나 주소 모양이 아니면 null
    if (typeof rawValue !== "string" || !rawValue.trim()) {
        return null;
    }

    let url;
    try {
        url = new URL(rawValue.trim());
    } catch {
        return null;
    }

    // https·계정 정보 없음·포트 없음·디스코드 주소일 때만
    if (url.protocol !== "https:") {
        return null;
    }

    if (url.username || url.password) {
        return null;
    }

    if (url.port) {
        return null;
    }

    if (url.hostname !== INVITE_SHORT_HOST && !DISCORD_APP_HOSTS.has(url.hostname)) {
        return null;
    }

    // 경로 모양까지 맞아야 통과
    if (!isAllowedSupportPath(url)) {
        return null;
    }

    return url.toString();
}
