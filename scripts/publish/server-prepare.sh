#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

BASE_DIR="${PUBLISH_BASE_DIR:-/opt/obsidian-publish}"
REPO_DIR="$BASE_DIR/repo"
DB_DIR="$BASE_DIR/db"
RUNS_DIR="$BASE_DIR/runs"
LOCK_FILE="$BASE_DIR/publish.lock"
LATEST_READY_FILE="$BASE_DIR/latest-ready"
LIVESYNC_IMAGE="${LIVESYNC_IMAGE:-aspirinna/livesync-cli:local}"
BUILDER_IMAGE="${BUILDER_IMAGE:-aspirinna/clarity-builder:local}"
PNPM_STORE_VOLUME="${PNPM_STORE_VOLUME:-clarity-pnpm-store}"
NODE_MODULES_VOLUME="${NODE_MODULES_VOLUME:-clarity-node-modules}"

log() {
	printf '[prepare] %s\n' "$*"
}

fail() {
	printf '[prepare] ERROR: %s\n' "$*" >&2
	exit 1
}

for command in docker flock git realpath tar; do
	command -v "$command" >/dev/null 2>&1 || fail "缺少命令：$command"
done

install -d -m 700 "$RUNS_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || fail '另一个发布任务正在运行'

[[ -d "$REPO_DIR/.git" ]] || fail "Git 仓库不存在：$REPO_DIR"
[[ -d "$DB_DIR" ]] || fail "LiveSync 数据目录不存在：$DB_DIR"
[[ "$(git -C "$REPO_DIR" branch --show-current)" == 'main' ]] || fail '服务器仓库当前不在 main 分支'
[[ -z "$(git -C "$REPO_DIR" status --porcelain)" ]] || fail '服务器仓库存在未提交修改，请先处理'

log '更新服务器上的博客仓库'
git -C "$REPO_DIR" fetch origin main
git -C "$REPO_DIR" merge --ff-only origin/main

BASE_COMMIT="$(git -C "$REPO_DIR" rev-parse HEAD)"
[[ "$BASE_COMMIT" == "$(git -C "$REPO_DIR" rev-parse origin/main)" ]] || fail '服务器仓库含有尚未推送的提交'

log '从远程 CouchDB 同步 LiveSync 本地数据库'
docker run --rm \
	-v "$DB_DIR:/data" \
	"$LIVESYNC_IMAGE" sync

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RUN_DIR="$RUNS_DIR/$RUN_ID"
VAULT_DIR="$RUN_DIR/vault"
SITE_DIR="$RUN_DIR/site"
GENERATED_DIR="$RUN_DIR/generated-posts"

install -d -m 700 "$VAULT_DIR" "$SITE_DIR"
printf '%s\n' 'preparing' > "$RUN_DIR/status"
printf '%s\n' "$BASE_COMMIT" > "$RUN_DIR/base-commit"

on_error() {
	printf '%s\n' 'failed' > "$RUN_DIR/status"
	printf '[prepare] 发布准备失败，保留现场：%s\n' "$RUN_DIR" >&2
}
trap on_error ERR

log "生成不可变 Vault 快照：$RUN_ID"
docker run --rm \
	-v "$DB_DIR:/data" \
	-v "$VAULT_DIR:/vault" \
	"$LIVESYNC_IMAGE" mirror /vault

log '从当前 Git 提交导出隔离的构建目录'
git -C "$REPO_DIR" archive --format=tar HEAD | tar -xf - -C "$SITE_DIR"

log '转换博客文章并执行 lint 和静态生成'
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
		pnpm publish:prepare /run/vault /run/generated-posts
	cp -a /run/generated-posts/. content/posts/
		pnpm lint
		pnpm generate
	'

[[ -f "$SITE_DIR/.output/public/index.html" ]] || fail '静态首页没有生成'
[[ -f "$SITE_DIR/.output/public/api/stats" ]] || fail '统计数据没有生成'
[[ -f "$SITE_DIR/.output/public/atom.xml" ]] || fail 'Atom 订阅源没有生成'

POST_COUNT="$(find "$GENERATED_DIR" -type f -name '*.md' | wc -l)"
[[ "$POST_COUNT" -gt 0 ]] || fail '没有生成任何待发布文章'

(
	cd "$GENERATED_DIR"
	find . -type f -print0 | sort -z | xargs -0 sha256sum
) > "$RUN_DIR/generated.sha256"

find "$GENERATED_DIR" -type f -name '*.md' \
	-printf 'content/posts/%P\n' | sort > "$RUN_DIR/managed-files.txt"

cat > "$RUN_DIR/summary.txt" <<EOF
运行编号: $RUN_ID
基础提交: $BASE_COMMIT
待发布文章数: $POST_COUNT
生成文章目录: $GENERATED_DIR
EOF

rm -rf -- "$SITE_DIR"
printf '%s\n' 'ready' > "$RUN_DIR/status"
printf '%s\n' "$RUN_DIR" > "$LATEST_READY_FILE.tmp"
mv -f "$LATEST_READY_FILE.tmp" "$LATEST_READY_FILE"
trap - ERR

log '准备完成，尚未修改 Git 仓库，也未发布网站'
cat "$RUN_DIR/summary.txt"
log "确认文章后运行：bash $REPO_DIR/scripts/publish/server-publish.sh"
