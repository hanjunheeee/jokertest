#!/usr/bin/env bash
set -euo pipefail

REPO="${1:?usage: import_on_mac.sh /path/to/clean/repo}"
BUNDLE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
die(){ printf '\nERROR: %s\n' "$*" >&2; exit 1; }

REPO="$(cd "$REPO" && pwd)"
[[ -d "$REPO/.git" ]] || die "Git repo 아님: $REPO"

BASE="$(python3 - "$BUNDLE/manifest.json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1],encoding="utf-8"))["base_commit"])
PY
)"
HEAD="$(git -C "$REPO" rev-parse HEAD)"
[[ "$HEAD" == "$BASE" ]] || die "기준 커밋 불일치: Mac HEAD=$HEAD / Windows base=$BASE"

if [[ -n "$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)" ]]; then
  git -C "$REPO" status --short
  die "Mac target repo가 dirty 상태라 중단"
fi

EXPECTED="$(python3 - "$BUNDLE/manifest.json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1],encoding="utf-8"))["tracked_patch_sha256"])
PY
)"
ACTUAL="$(shasum -a 256 "$BUNDLE/tracked.patch" | awk '{print $1}')"
[[ "$EXPECTED" == "$ACTUAL" ]] || die "tracked.patch SHA 불일치"

python3 - "$REPO" "$BUNDLE" <<'PY'
import json,sys,hashlib
from pathlib import Path
repo=Path(sys.argv[1]); b=Path(sys.argv[2])
m=json.loads((b/"manifest.json").read_text(encoding="utf-8"))
for e in m["untracked"]:
    src=b/"untracked"/e["path"]; dst=repo/e["path"]
    if not src.is_file(): raise SystemExit("bundle 파일 누락: "+e["path"])
    if dst.exists(): raise SystemExit("Mac repo에 같은 파일 존재: "+e["path"])
    if hashlib.sha256(src.read_bytes()).hexdigest()!=e["sha256"]:
        raise SystemExit("SHA 불일치: "+e["path"])
PY

if [[ -s "$BUNDLE/tracked.patch" ]]; then
  git -C "$REPO" apply --check --whitespace=nowarn "$BUNDLE/tracked.patch"
  git -C "$REPO" apply --whitespace=nowarn "$BUNDLE/tracked.patch"
fi

python3 - "$REPO" "$BUNDLE" <<'PY'
import json,sys,shutil
from pathlib import Path
repo=Path(sys.argv[1]); b=Path(sys.argv[2])
m=json.loads((b/"manifest.json").read_text(encoding="utf-8"))
for e in m["untracked"]:
    src=b/"untracked"/e["path"]; dst=repo/e["path"]
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(src,dst)
PY

echo
echo "JOKER_MAC_TRANSFER_IMPORT_PASS"
git -C "$REPO" status --short
echo "변경은 unstaged 상태이며 commit/push하지 않았습니다."
