// 빌드 때 넣는 환경 값 (서버 주소·디스코드 고객센터 주소)
// api client·소켓 연결·소셜 로그인·디스코드 계정 연결·로비 고객센터가 씀
// api와 소켓이 같은 서버 주소를 씀
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// 그대로 링크에 안 넣고 discordSupport.js 검사를 거쳐 씀
export const DISCORD_SUPPORT_URL = import.meta.env.VITE_DISCORD_SUPPORT_URL;
