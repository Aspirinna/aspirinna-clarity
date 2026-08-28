#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

BASE_DIR="${PUBLISH_BASE_DIR:-/opt/obsidian-publish}"
REPO_DIR="$BASE_DIR/repo"
PUBLISH_DB_DIR="${PUBLISH_DB_DIR:-$BASE_DIR/publisher-db}"
RUNS_DIR="$BASE_DIR/runs"
LOCK_FILE="$BASE_DIR/publish.lock"
LATEST_READY_FILE="$BASE_DIR/latest-ready"
LATEST_ATTEMPT_FILE="$BASE_DIR/latest-attempt"
LIVESYNC_IMAGE="${LIVESYNC_IMAGE:-aspirinna/livesync-cli:local}"
BUILDER_IMAGE="${BUILDER_IMAGE:-aspirinna/clarity-builder:local}"
PNPM_STORE_VOLUME="${PNPM_STORE_VOLUME:-clarity-pnpm-store}"
NODE_MODULES_VOLUME="${NODE_MODULES_VOLUME:-clarity-node-modules}"
SCRIPT_PATH="$REPO_DIR/scripts/publish/server-prepare.sh"

log() {
	printf '[prepare] %s\n' "$*"
}

fail() {
	printf '[prepare] ERROR: %s\n' "$*" >&2
	exit 1
}

for command in awk docker flock git realpath sha256sum tar; do
	command -v "$command" >/dev/null 2>&1 || fail "缺少命令：$command"
done

install -d -m 700 "$RUNS_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || fail '另一个发布任务正在运行'

[[ -d "$REPO_DIR/.git" ]] || fail "Git 仓库不存在：$REPO_DIR"
[[ -f "$PUBLISH_DB_DIR/.livesync/settings.json" ]] || fail "发布数据库尚未初始化：$PUBLISH_DB_DIR"
[[ "$(git -C "$REPO_DIR" branch --show-current)" == 'main' ]] || fail '服务器仓库当前不在 main 分支'
[[ -z "$(git -C "$REPO_DIR" status --porcelain)" ]] || fail '服务器仓库存在未提交修改，请先处理'

log '更新服务器上的博客仓库'
SCRIPT_HASH_BEFORE="$(sha256sum "$SCRIPT_PATH" | awk '{ print $1 }')"
git -C "$REPO_DIR" fetch origin main
git -C "$REPO_DIR" merge --ff-only origin/main
SCRIPT_HASH_AFTER="$(sha256sum "$SCRIPT_PATH" | awk '{ print $1 }')"

if [[ "$SCRIPT_HASH_BEFORE" != "$SCRIPT_HASH_AFTER" && "${PUBLISH_SCRIPT_RESTARTED:-0}" != '1' ]]; then
	log '准备脚本已更新，重新执行仓库中的最新版本'
	export PUBLISH_SCRIPT_RESTARTED=1
	exec /usr/bin/bash "$SCRIPT_PATH"
fi

BASE_COMMIT="$(git -C "$REPO_DIR" rev-parse HEAD)"
[[ "$BASE_COMMIT" == "$(git -C "$REPO_DIR" rev-parse origin/main)" ]] || fail '服务器仓库含有尚未推送的提交'

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RUN_DIR="$RUNS_DIR/$RUN_ID"
VAULT_DIR="$RUN_DIR/vault"
SITE_DIR="$RUN_DIR/site"
GENERATED_DIR="$RUN_DIR/generated"

install -d -m 700 "$VAULT_DIR/Blog" "$VAULT_DIR/Moments" "$VAULT_DIR/Projects" "$SITE_DIR"
printf '%s\n' 'preparing' > "$RUN_DIR/status"
printf '%s\n' "$BASE_COMMIT" > "$RUN_DIR/base-commit"
printf '%s\n' "$RUN_DIR" > "$LATEST_ATTEMPT_FILE.tmp"
mv -f "$LATEST_ATTEMPT_FILE.tmp" "$LATEST_ATTEMPT_FILE"

on_error() {
	printf '%s\n' 'failed' > "$RUN_DIR/status"
	printf '[prepare] 发布准备失败，保留现场：%s\n' "$RUN_DIR" >&2
}
trap on_error ERR

log '从 CouchDB 更新已授权的只读发布数据库'
docker run --rm \
	-v "$PUBLISH_DB_DIR:/data" \
	"$LIVESYNC_IMAGE" sync

log '列出数据库中的可发布内容'
docker run --rm \
	-v "$PUBLISH_DB_DIR:/data" \
	"$LIVESYNC_IMAGE" ls | tee "$RUN_DIR/livesync-list.txt"

mapfile -t CONTENT_FILES < <(
	awk -F '\t' '$1 ~ /^(Blog|Moments|Projects)\/.*\.md$/ { print $1 }' "$RUN_DIR/livesync-list.txt"
)
[[ "${#CONTENT_FILES[@]}" -gt 0 ]] || fail 'LiveSync 数据库中没有找到 Blog、Moments 或 Projects 下的 Markdown'

log "只读导出 ${#CONTENT_FILES[@]} 个 Markdown 到 Vault 快照"
for vault_path in "${CONTENT_FILES[@]}"; do
	[[ "$vault_path" != *'..'* ]] || fail "数据库中存在非法路径：$vault_path"
	install -d "$(dirname "$VAULT_DIR/$vault_path")"
	docker run --rm \
		-v "$PUBLISH_DB_DIR:/data" \
		-v "$VAULT_DIR:/vault" \
		"$LIVESYNC_IMAGE" pull "$vault_path" "/vault/$vault_path"
done

log '从当前 Git 提交导出隔离的构建目录'
git -C "$REPO_DIR" archive --format=tar HEAD | tar -xf - -C "$SITE_DIR"

log '从隔离构建目录移除上一批发布器管理的内容'
if [[ -f "$SITE_DIR/.obsidian-publish-manifest" ]]; then
	while IFS= read -r managed_path; do
		[[ -z "$managed_path" ]] && continue
		case "$managed_path" in
			content/posts/*|app/generated/moments.json|app/generated/projects.json) ;;
			*) fail "旧清单中存在非法路径：$managed_path" ;;
		esac
		[[ "$managed_path" != *'..'* ]] || fail "旧清单中存在非法路径：$managed_path"
		rm -f -- "$SITE_DIR/$managed_path"
	done < "$SITE_DIR/.obsidian-publish-manifest"
fi

log '转换博客、即刻与项目内容并执行 lint 和静态生成'
docker run --rm \
	-v "$SITE_DIR:/workspace" \
	-v "$RUN_DIR:/run" \
	-v "$PNPM_STORE_VOLUME:/pnpm/store" \
	-v "$NODE_MODULES_VOLUME:/workspace/node_modules" \
	-w /workspace \
	"$BUILDER_IMAGE" \
	sh -lc '
		set -eu
		pnpm config set store-dir /pnpm/store
		pnpm install --frozen-lockfile
		pnpm prepare
		pnpm publish:prepare /run/vault /run/generated
		cp -a /run/generated/. .
		pnpm lint
		pnpm generate
	'

[[ -f "$SITE_DIR/.output/public/index.html" ]] || fail '静态首页没有生成'
[[ -f "$SITE_DIR/.output/public/api/stats" ]] || fail '统计数据没有生成'
[[ -f "$SITE_DIR/.output/public/atom.xml" ]] || fail 'Atom 订阅源没有生成'

POST_COUNT="$(find "$GENERATED_DIR/content/posts" -type f -name '*.md' | wc -l)"
[[ "$POST_COUNT" -gt 0 ]] || fail '没有生成任何待发布文章'
MOMENT_COUNT="$(grep -c '"createdAt"' "$GENERATED_DIR/app/generated/moments.json" || true)"
PROJECT_COUNT="$(grep -c '"id"' "$GENERATED_DIR/app/generated/projects.json" || true)"

(
	cd "$GENERATED_DIR"
	find . -type f -print0 | sort -z | xargs -0 sha256sum
) > "$RUN_DIR/generated.sha256"

(
	cd "$GENERATED_DIR"
	find content/posts -type f -name '*.md' -print
	printf '%s\n' 'app/generated/moments.json' 'app/generated/projects.json'
) | sort > "$RUN_DIR/managed-files.txt"

cat > "$RUN_DIR/summary.txt" <<EOF
运行编号: $RUN_ID
基础提交: $BASE_COMMIT
待发布博客: $POST_COUNT 篇
待发布即刻: $MOMENT_COUNT 条
待发布项目: $PROJECT_COUNT 个
生成快照目录: $GENERATED_DIR
EOF

rm -rf -- "$SITE_DIR"
printf '%s\n' 'ready' > "$RUN_DIR/status"
printf '%s\n' "$RUN_DIR" > "$LATEST_READY_FILE.tmp"
mv -f "$LATEST_READY_FILE.tmp" "$LATEST_READY_FILE"
trap - ERR

log '准备完成，尚未修改 Git 仓库，也未发布网站'
cat "$RUN_DIR/summary.txt"
log "确认文章后运行：bash $REPO_DIR/scripts/publish/server-publish.sh"
