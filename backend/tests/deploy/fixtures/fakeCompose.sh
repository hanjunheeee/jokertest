# nodes.sh 시험용 가짜 compose·docker 파일, tests/deploy/nodesSh.drain.test.js가 nodes.sh 다음에 source로 읽음
# 서비스마다 $STATE/<svc>.image(태그)·.draining(드레인 켜짐)·.load(판+방 수) 파일로 상태를 흉내
log() { echo "[log] $*"; }
sleep() { :; }
docker() { :; }
gen_nodes() { :; }
running() { [ -f "$STATE/$1.image" ]; }
compose() {
    local cmd="$1"; shift
    case "$cmd" in
        up)
            local force=0 a
            for a in "$@"; do [ "$a" = "--force-recreate" ] && force=1; done
            for a in "$@"; do
                case "$a" in -*|db|redis) continue ;; esac
                if [ "$force" = 1 ] || [ "$(cat "$STATE/$a.image" 2>/dev/null)" != "$IMAGE_TAG" ]; then
                    echo "$IMAGE_TAG" > "$STATE/$a.image"; rm -f "$STATE/$a.draining"; echo "recreate $a" >> "$STATE/events"
                fi
            done ;;
        exec)
            [ "$1" = "-T" ] && shift
            local svc="$1"; shift
            local a path="" body="" nodeid=""
            for a in "$@"; do
                case "$a" in CALL_PATH=*) path="${a#CALL_PATH=}" ;; CALL_BODY=*) body="${a#CALL_BODY=}" ;; NODE_ID=*) nodeid="${a#NODE_ID=}" ;; esac
            done
            if [[ "$path" == /internal/nodes/*/drain ]]; then
                if [[ "$body" == *false* ]]; then rm -f "$STATE/$svc.draining"; else touch "$STATE/$svc.draining"; fi
                echo '{"ok":true}'
            elif [ -n "$nodeid" ]; then
                cat "$STATE/$svc.load" 2>/dev/null || echo 0
            fi
            return 0 ;;
        *) return 0 ;;
    esac
}
