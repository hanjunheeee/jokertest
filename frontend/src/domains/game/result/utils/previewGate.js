// 결과 화면 미리보기(주소 ?outcome=)를 열어도 되는지 보기: 운영 빌드에서는 막음 (개발·시험 빌드에서만 열림)
// 미리보기 값 훅(useGameResultPreview)이 사용 → PC·모바일 결과 화면이 같이 막힘

// 이 빌드가 운영 빌드인지 (node 시험엔 import.meta.env가 없어 ?. 로 읽음 → 운영 아님)
const BUILD_IS_PROD = import.meta.env?.PROD === true

// 운영이면 거짓 (가짜 승패 화면을 주소만으로 띄우지 못하게), isProd는 시험이 넣어 볼 때만 줌
export function isResultPreviewAllowed(isProd = BUILD_IS_PROD) {
  return isProd !== true
}
