import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const targets = ["src/pages/LoginPage.jsx", "src/assets/loginAssets.js"]

let failed = false
for (const rel of targets) {
  const file = path.join(root, rel)
  const text = fs.readFileSync(file, "utf8")
  if (text.includes("\uFFFD") || /\?{3,}/.test(text)) {
    console.error(`FAIL: ${rel} may have encoding corruption`)
    failed = true
  } else {
    console.log(`OK: ${rel}`)
  }
}
process.exit(failed ? 1 : 0)
