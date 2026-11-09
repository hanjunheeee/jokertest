// 요청 번호(UUID) 만들기 파일, 같은 번호 두 번 오면 서버가 처음 결과를 돌려줌 → 두 번 눌러도 한 번만
// 돈·공지·문의 답 쓰기 화면이 보내기 전에 하나 만들어 둠
const toUuid = (bytes) => {
  // 4번 판(무작위) 표시: 7번째 앞자리 4, 9번째 앞자리 8~b
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// randomUUID는 https·localhost에서만 있음 → 휴대폰으로 내부 주소(http) 열 때는 직접 만듦
export const newRequestId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return toUuid(crypto.getRandomValues(new Uint8Array(16)))
}
