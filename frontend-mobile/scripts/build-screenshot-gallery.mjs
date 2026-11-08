// docs/screenshots/png/*.png → 1920×1080 기준 10장(5×2) + 캡션 HTML
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { labelForScreenshotFile } from "./screenshot-labels.mjs"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const pngDir = path.join(root, "docs", "screenshots", "png")
const outFile = path.join(root, "docs", "screenshots", "gallery.html")
const perPage = 10

if (!fs.existsSync(pngDir)) {
  console.error("PNG 폴더 없음:", pngDir)
  process.exit(1)
}

const files = fs
  .readdirSync(pngDir)
  .filter((f) => f.toLowerCase().endsWith(".png"))
  .sort((a, b) => a.localeCompare(b, "ko"))

if (files.length === 0) {
  console.error("PNG 없음:", pngDir)
  process.exit(1)
}

const pages = []
for (let i = 0; i < files.length; i += perPage) {
  pages.push(files.slice(i, i + perPage))
}

const pageHtml = pages
  .map(
    (chunk) => `  <section class="sheet">
${chunk
  .map(
    (f) => `    <figure class="cell">
      <figcaption class="cap">${labelForScreenshotFile(f)}</figcaption>
      <div class="frame"><img src="png/${f}" alt="" loading="lazy" /></div>
    </figure>`,
  )
  .join("\n")}
  </section>`,
  )
  .join("\n")

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>Mobile UI screenshots</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d0d0d; }
    .sheet {
      width: 1920px;
      height: 1080px;
      max-width: 100vw;
      margin: 0 auto 20px;
      padding: 16px 20px 20px;
      background: #161616;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 10px 14px;
      page-break-after: always;
    }
    .cell {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }
    .cap {
      flex: 0 0 auto;
      margin-bottom: 4px;
      font: 600 13px/1.25 ui-sans-serif, system-ui, sans-serif;
      color: #d4cfc6;
      letter-spacing: -0.01em;
    }
    .frame {
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0a;
      border-radius: 4px;
      overflow: hidden;
    }
    .frame img {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
    }
  </style>
</head>
<body>
${pageHtml}
</body>
</html>
`

fs.writeFileSync(outFile, html, "utf8")
console.log(`gallery: ${outFile} (${files.length}장, ${pages.length}페이지)`)
