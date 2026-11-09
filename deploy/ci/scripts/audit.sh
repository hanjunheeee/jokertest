#!/usr/bin/env bash
# CI 의존성 취약점 검사 파일, 폴더마다 npm audit --audit-level=high (높음·치명 하나라도 있으면 실패)
# 2026-11-09 높음 0으로 맞춤 → 새로 생기면 바로 실패로 알림. 고치기: 그 폴더에서 npm audit fix (메이저 올림은 따로 확인)
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

failed=()
for dir in backend frontend frontend-mobile e2e; do
    step "$dir: npm audit --audit-level=high"
    if ! (cd "$ROOT/$dir" && npm audit --audit-level=high); then
        failed+=("$dir")
    fi
done

if [ ${#failed[@]} -gt 0 ]; then
    echo "[ci] 높음 이상 취약점 있음: ${failed[*]}" >&2
    exit 1
fi
echo "[ci] 높음 이상 취약점 없음"
