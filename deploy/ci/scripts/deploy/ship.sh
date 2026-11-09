#!/usr/bin/env bash
# 배포 보내기 파일(러너에서), 서버에 compose 파일·배포 스크립트를 올리고 SSH로 remote.sh를 부름
# 쓰는 법: ship.sh deploy <태그> | ship.sh rollback [태그] | ship.sh status
# 받는 비밀값: DEPLOY_HOST(여러 대면 DEPLOY_HOSTS=쉼표 목록 — 앞의 하나만 백업·마이그레이션), DEPLOY_USER, DEPLOY_SSH_KEY(개인 키 내용 또는 파일 경로),
#             DEPLOY_PATH(서버 안 폴더, .env.production이 있는 곳), DEPLOY_SSH_KNOWN_HOSTS(권장, 없으면 ssh-keyscan으로 받고 경고)
# 받는 값: DEPLOY_PORT(기본 22), IMAGE_REGISTRY, REGISTRY_USERNAME·REGISTRY_PASSWORD(서버 pull 로그인),
#          DEPLOY_MAINTENANCE(기본 1: 점검 켜고 판 끝날 때까지 기다림), DRAIN_MAX_MINUTES(기본 30), DRAIN_FORCE(기본 0)
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

action="${1:?쓰는 법: ship.sh deploy <태그> | rollback [태그] | status}"
tag="${2:-}"
: "${DEPLOY_USER:?DEPLOY_USER 필요}" "${DEPLOY_PATH:?DEPLOY_PATH 필요}" "${DEPLOY_SSH_KEY:?DEPLOY_SSH_KEY 필요}"
hosts_csv="${DEPLOY_HOSTS:-${DEPLOY_HOST:?DEPLOY_HOST 또는 DEPLOY_HOSTS 필요}}"
IFS=',' read -r -a hosts <<< "$hosts_csv"
port="${DEPLOY_PORT:-22}"

# SSH 준비: 키는 임시 파일(권한 600)로, 끝나면 지움
ssh_dir="$(mktemp -d)"
trap 'rm -rf "$ssh_dir"' EXIT
if [ -f "$DEPLOY_SSH_KEY" ]; then cp "$DEPLOY_SSH_KEY" "$ssh_dir/key"; else printf '%s\n' "$DEPLOY_SSH_KEY" > "$ssh_dir/key"; fi
chmod 600 "$ssh_dir/key"
if [ -n "${DEPLOY_SSH_KNOWN_HOSTS:-}" ]; then
    printf '%s\n' "$DEPLOY_SSH_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
else
    echo "[deploy] 경고: DEPLOY_SSH_KNOWN_HOSTS 없음 → ssh-keyscan으로 받음 (처음 한 번만 쓰고 비밀값으로 넣기 권장)" >&2
    for h in "${hosts[@]}"; do ssh-keyscan -p "$port" -H "$h" >> "$ssh_dir/known_hosts" 2>/dev/null; done
fi
ssh_opts=(-i "$ssh_dir/key" -p "$port" -o UserKnownHostsFile="$ssh_dir/known_hosts" -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=15)

# 서버에 올릴 파일: compose 셋·nginx(HTTPS 조각 붙이기용)·배포 스크립트 (git에 있는 그대로)
bundle="$ssh_dir/bundle.tar.gz"
git -C "$ROOT" archive --format=tar.gz -o "$bundle" HEAD docker-compose.yml docker-compose.prod.yml nginx deploy/ci/compose.registry.yml deploy/ci/scripts/deploy/remote.sh

# 서버에 넘길 값 (비밀 아님만 — 레지스트리 비번은 표준 입력으로 따로)
remote_env() {
    printf 'IMAGE_REGISTRY=%q DEPLOY_MAINTENANCE=%q DRAIN_MAX_MINUTES=%q DRAIN_FORCE=%q RUN_MIGRATIONS=%q SERVER_ROLE=%q ' \
        "${IMAGE_REGISTRY:-}" "${DEPLOY_MAINTENANCE:-1}" "${DRAIN_MAX_MINUTES:-30}" "${DRAIN_FORCE:-0}" "$1" "$2"
}

index=0
for host in "${hosts[@]}"; do
    target="$DEPLOY_USER@$host"
    # 여러 대: 첫 서버만 백업·마이그레이션 (DB는 하나), 나머지는 이미지 교체만 — SERVER_ID·REDIS_URL은 각 서버 .env.production에
    if [ $index -eq 0 ]; then migrations=1; role=primary; else migrations=0; role=secondary; fi
    index=$((index + 1))
    step "[$host] 파일 올리기 → $DEPLOY_PATH"
    ssh "${ssh_opts[@]}" "$target" "mkdir -p $(printf '%q' "$DEPLOY_PATH") && tar -xzf - -C $(printf '%q' "$DEPLOY_PATH")" < "$bundle"

    if [ "$action" != "status" ] && [ -n "${REGISTRY_USERNAME:-}" ] && [ -n "${REGISTRY_PASSWORD:-}" ]; then
        step "[$host] 레지스트리 로그인"
        printf '%s' "$REGISTRY_PASSWORD" | ssh "${ssh_opts[@]}" "$target" "docker login $(printf '%q' "${IMAGE_REGISTRY%%/*}") -u $(printf '%q' "$REGISTRY_USERNAME") --password-stdin"
    fi

    step "[$host] remote.sh $action $tag"
    ssh "${ssh_opts[@]}" "$target" "cd $(printf '%q' "$DEPLOY_PATH") && $(remote_env "$migrations" "$role") bash deploy/ci/scripts/deploy/remote.sh $(printf '%q' "$action") $(printf '%q' "$tag")"
done
