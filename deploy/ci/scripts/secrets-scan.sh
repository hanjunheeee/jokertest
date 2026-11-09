#!/usr/bin/env bash
# CI 비밀값 새는 것 검사 파일, gitleaks로 ① 지금 파일 전체 ② 이번에 들어온 커밋들만 검사
# 옛 기록에 남은 값(docs/… git 정리 할 일)은 기록 다시 쓰기 전까지 늘 걸려서, 기록 전체가 아니라 이번 범위만 봄
# 받는 값: SECRET_SCAN_RANGE(예: origin/main..HEAD, 비면 ②는 건너뜀), GITLEAKS_VERSION(기본 아래 값)
# 허용 목록(시험 키 모양·예시 값)은 deploy/ci/gitleaks.toml — 찾은 값은 --redact로 가려서 찍음
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.24.0}"
config="$ROOT/deploy/ci/gitleaks.toml"

if ! command -v gitleaks >/dev/null 2>&1; then
    if [ "${CI:-}" != "true" ] && [ "${CI:-}" != "1" ]; then
        echo "[ci] gitleaks 없음 → 로컬에선 건너뜀 (CI에선 받아서 씀)"
        exit 0
    fi
    step "gitleaks $GITLEAKS_VERSION 받기 (체크섬 확인)"
    tmp="$(mktemp -d)"
    base="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"
    tarball="gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
    curl -fsSL -o "$tmp/$tarball" "$base/$tarball"
    curl -fsSL -o "$tmp/checksums.txt" "$base/gitleaks_${GITLEAKS_VERSION}_checksums.txt"
    (cd "$tmp" && grep " $tarball\$" checksums.txt | sha256sum -c -)
    tar -xzf "$tmp/$tarball" -C "$tmp" gitleaks
    export PATH="$tmp:$PATH"
fi

cd "$ROOT"
step "gitleaks: 지금 파일 전체"
gitleaks dir . --config "$config" --redact --no-banner --verbose

if [ -n "${SECRET_SCAN_RANGE:-}" ]; then
    step "gitleaks: 이번 커밋들 ($SECRET_SCAN_RANGE)"
    gitleaks git . --config "$config" --redact --no-banner --verbose --log-opts="$SECRET_SCAN_RANGE"
else
    echo "[ci] SECRET_SCAN_RANGE 없음 → 커밋 범위 검사 건너뜀"
fi
