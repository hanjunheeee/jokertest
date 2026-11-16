// 시험용 모듈 읽기 손잡이: src 아래 .js 파일의 import.meta.env를 개발 빌드 값(DEV 참)으로 채움
// a18-setup 시험이 "개발 빌드로 불러도 운영 규칙과 같나"를 볼 때 register로 켬 (공용 jsx 손잡이는 DEV 거짓으로 채움)
const SRC_MARK = "/frontend/src/"
const DEV_ENV = 'import.meta.env = { DEV: true, PROD: false, MODE: "development" };\n'

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)
  if (!url.startsWith("file:") || !url.includes(SRC_MARK) || !url.endsWith(".js")) return result
  if (result.format !== "module" || result.source == null) return result
  return { ...result, source: DEV_ENV + String(result.source), shortCircuit: true }
}
