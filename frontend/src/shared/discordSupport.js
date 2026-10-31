const DISCORD_INVITE_SHORT_HOST = "discord.gg";
const DISCORD_APP_HOSTS = new Set(["discord.com", "www.discord.com"]);

const isInviteCode = (segment) => /^[A-Za-z0-9-]+$/.test(segment ?? "");

const isSnowflake = (segment) => /^\d+$/.test(segment ?? "");

function isAllowedSupportPath(url) {
    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
    const rawSegments = url.pathname.split("/").slice(1);
    if (rawSegments.some((segment, index) => segment.length === 0 && index < rawSegments.length - 1)) {
        return false;
    }

    if (url.hostname === DISCORD_INVITE_SHORT_HOST) {
        return segments.length === 1 && isInviteCode(segments[0]);
    }

    if (segments[0] === "invite") {
        return segments.length === 2 && isInviteCode(segments[1]);
    }

    if (segments[0] === "channels") {
        return segments.length === 3 && isSnowflake(segments[1]) && isSnowflake(segments[2]);
    }

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

    if (url.username || url.password) {
        return null;
    }

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
