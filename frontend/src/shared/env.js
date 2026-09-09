// import.meta.env는 Vite 빌드타임 치환이라 이 값을 직접 참조하는 모듈은 Vite 없이(Node
// 테스트 러너 등에서) import할 수 없다. 이 파일 하나에만 그 참조를 모아두면, 이 파일을
// node:test의 mock.module로 통째로 갈아끼우는 것만으로 client.js/useSocket.js 같은 나머지
// 로직은 실제 코드 그대로 테스트할 수 있다(F-03 R-IMPL #6 — "Vite env라서 테스트 불가"를
// 이 경계 분리로 해소한다).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
