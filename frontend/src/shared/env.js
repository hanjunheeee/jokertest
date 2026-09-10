// import.meta.env는 Vite 빌드타임 치환이라 이 값을 직접 참조하는 모듈은 Vite 없이(Node
// 테스트 러너 등에서) import할 수 없다. 이 파일 하나에만 그 참조를 모아두면, 이 파일을
// node:test의 mock.module로 통째로 갈아끼우는 것만으로 client.js/useSocket.js 같은 나머지
// 로직은 실제 코드 그대로 테스트할 수 있다(F-03 R-IMPL #6 — "Vite env라서 테스트 불가"를
// 이 경계 분리로 해소한다).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// F-07 AC-05: 고객센터 Discord 초대 URL 원본 값이다. 백엔드 OAuth 앱 자격
// (DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET/DISCORD_REDIRECT_URI,
// backend/service/discordOAuth.service.js readRequiredEnv)과는 완전히 분리된 별도 설정
// 키다 — 이 값은 VITE_ 접두라 프런트 빌드에 그대로 노출되는 공개 값이고, 저 OAuth 자격은
// 서버 전용 비밀값이라 프런트 번들에 절대 들어가지 않는다. 이 값이 실제로 안전하게 쓸 수
// 있는 Discord 초대 URL인지 검증하는 순수 함수는 shared/discordSupport.js에 있다 — 설정
// 되지 않았으면(undefined) "사용 불가"로 취급하며, 이 값을 추측해서 채우지 않는다. F18이
// 로비 Discord 버튼에 이 값을 연결할 예정이며, 이 슬라이스는 그 버튼을 새로 연결하지
// 않는다(범위 밖).
export const DISCORD_SUPPORT_URL = import.meta.env.VITE_DISCORD_SUPPORT_URL;
