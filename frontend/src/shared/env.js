// 빌드 때 넣는 환경 값 (서버 주소)
// api client·소켓 연결·소셜 로그인·디스코드 계정 연결이 씀
// api와 소켓이 같은 서버 주소를 씀
// node 시험엔 import.meta.env가 없어 ?. 로 읽음
export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL;

