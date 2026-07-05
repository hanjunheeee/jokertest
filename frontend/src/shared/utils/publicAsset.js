/**
 * public/ 아래 정적 파일 URL (한글·공백 경로 인코딩)
 * @param {string} path - public 폴더 기준 상대 경로 (예: "bgm/LoginMusic.wav" 또는 "/bgm/LoginMusic.wav")
 * @returns {string} 앞에 "/"가 붙고 한글·공백이 URI 인코딩된 경로
 */
export function publicAsset(path) {
  // 슬래시로 시작하지 않으면 앞에 "/"를 붙여 절대 경로 형태로 통일
  const normalized = path.startsWith("/") ? path : `/${path}`
  // encodeURI: 경로에 포함된 한글·공백 등을 브라우저가 인식 가능한 형태로 변환
  return encodeURI(normalized)
}
