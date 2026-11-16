// 빌드 때 넣는 환경 값 (서버 주소·고객센터 주소)
// api client·소켓 연결·소셜 로그인·디스코드 계정 연결·고객센터 링크가 씀
// api와 소켓이 같은 서버 주소를 씀
// node 시험엔 import.meta.env가 없어 ?. 로 읽음
export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL;
// 고객센터 주소 (https 주소나 mailto, 비우면 링크 안 그림 — 그대로 안 쓰고 utils/supportLink.js로 가려 씀)
export const SUPPORT_URL = import.meta.env?.VITE_SUPPORT_URL;
