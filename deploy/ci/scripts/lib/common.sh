# CI 스크립트 공통 조각, 저장소 루트 찾기·단계 표시·npm ci 한 곳에
# 모든 deploy/ci/scripts/*.sh가 source함 (GitHub Actions·GitLab CI·로컬 모두 같은 스크립트)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
export ROOT

# 단계 이름 한 줄 (CI 로그에서 찾기 쉽게)
step() { printf '\n==> %s\n' "$*"; }

# npm ci: CI_SKIP_INSTALL=1이고 node_modules가 이미 있으면 건너뜀 (로컬에서 돌릴 때 개발 서버가 쓰는 node_modules 안 지우기)
npm_ci() {
    local dir="$1"
    if [ "${CI_SKIP_INSTALL:-0}" = "1" ] && [ -d "$ROOT/$dir/node_modules" ]; then
        echo "[ci] $dir: 설치 건너뜀 (CI_SKIP_INSTALL=1, node_modules 있음)"
        return 0
    fi
    step "$dir: npm ci"
    (cd "$ROOT/$dir" && npm ci --no-audit --no-fund)
}

# 그 폴더에서 npm 스크립트 하나
npm_run() {
    local dir="$1"; shift
    step "$dir: npm run $*"
    (cd "$ROOT/$dir" && npm run "$@")
}
