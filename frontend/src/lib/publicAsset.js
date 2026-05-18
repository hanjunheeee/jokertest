/** public/ 아래 정적 파일 URL (한글·공백 경로 인코딩) */
export function publicAsset(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`
  return encodeURI(normalized)
}
