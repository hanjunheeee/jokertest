// 사용: node scripts/check-r2-url.mjs
// R2 공개 URL이 객체에 대해 200 인지 확인합니다.

const base = process.env.VITE_ASSETS_BASE_URL?.replace(/\/$/, "")
const key = "대기실 배경 이미지2.png"

if (!base) {
  console.error("VITE_ASSETS_BASE_URL 없음. frontend/.env 확인")
  process.exit(1)
}

const url = `${base}/${encodeURIComponent(key)}`
console.log("요청 URL:", url)

const res = await fetch(url, { method: "HEAD" })
console.log("상태:", res.status, res.statusText)
console.log("content-type:", res.headers.get("content-type"))
