#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

BASE_DIR="${PUBLISH_BASE_DIR:-/opt/obsidian-publish}"
REPO_DIR="$BASE_DIR/repo"
RUNS_DIR="$BASE_DIR/runs"
LOCK_FILE="$BASE_DIR/publish.lock"
LATEST_READY_FILE="$BASE_DIR/latest-ready"
MANIFEST_FILE="$REPO_DIR/.obsidian-publish-manifest"
EXPECTED_RUN_ID="${1:-}"

log() {
	printf '[publish] %s\n' "$*"
}

fail() {
	printf '[publish] ERROR: %s\n' "$*" >&2
	exit 1
}

for command in flock git realpath sha256sum; do
	command -v "$command" >/dev/null 2>&1 || fail "缺少命令：$command"
done

exec 9>"$LOCK_FILE"
flock -n 9 || fail '另一个发布任务正在运行'

[[ -f "$LATEST_READY_FILE" ]] || fail '没有找到已经准备完成的发布批次'
read -r RUN_DIR < "$LATEST_READY_FILE"
RUN_DIR="$(realpath -e "$RUN_DIR")"
REAL_RUNS_DIR="$(realpath -e "$RUNS_DIR")"
[[ "$RUN_DIR" == "$REAL_RUNS_DIR/"* ]] || fail '发布批次路径不在 runs 目录内'
[[ "$(cat "$RUN_DIR/status")" == 'ready' ]] || fail '这个发布批次不是 ready 状态'

RUN_ID="$(basename "$RUN_DIR")"
if [[ -n "$EXPECTED_RUN_ID" ]]; then
	[[ "$EXPECTED_RUN_ID" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9]+$ ]] || fail 'API 提供的发布批次编号格式不正确'
	[[ "$RUN_ID" == "$EXPECTED_RUN_ID" ]] || fail '待确认批次已经变化，请重新检查后再发布'
fi

on_error() {
	if [[ "$(cat "$RUN_DIR/status" 2>/dev/null || true)" != 'push-failed' ]]; then
		printf '%s\n' 'publish-failed' > "$RUN_DIR/status"
	fi
	printf '[publish] 发布任务失败，批次现场保留在：%s\n' "$RUN_DIR" >&2
}
trap on_error ERR

GENERATED_DIR="$RUN_DIR/generated"
BASE_COMMIT="$(cat "$RUN_DIR/base-commit")"
[[ -d "$GENERATED_DIR" ]] || fail '待发布内容快照目录不存在'

log '重新校验准备阶段生成的内容快照'
(
	cd "$GENERATED_DIR"
	sha256sum -c "$RUN_DIR/generated.sha256"
)

[[ -z "$(git -C "$REPO_DIR" status --porcelain)" ]] || fail '服务器仓库存在未提交修改，请先处理'
git -C "$REPO_DIR" fetch origin main

CURRENT_COMMIT="$(git -C "$REPO_DIR" rev-parse HEAD)"
REMOTE_COMMIT="$(git -C "$REPO_DIR" rev-parse origin/main)"
[[ "$CURRENT_COMMIT" == "$BASE_COMMIT" ]] || fail '准备完成后服务器仓库发生了变化，请重新运行准备任务'
[[ "$REMOTE_COMMIT" == "$BASE_COMMIT" ]] || fail '准备完成后 GitHub 仓库发生了变化，请重新运行准备任务'

log '移除上一批由 Obsidian 发布器管理的文章'
if [[ -f "$MANIFEST_FILE" ]]; then
	while IFS= read -r managed_path; do
		[[ -z "$managed_path" ]] && continue
		case "$managed_path" in
			content/posts/*|app/generated/moments.json|app/generated/projects.json) ;;
			*) fail "清单中存在非法路径：$managed_path" ;;
		esac
		[[ "$managed_path" != *'..'* ]] || fail "清单中存在非法路径：$managed_path"
		rm -f -- "$REPO_DIR/$managed_path"
	done < "$MANIFEST_FILE"
fi

log '把本批次内容快照写入博客仓库'
cp -a "$GENERATED_DIR/." "$REPO_DIR/"
cp "$RUN_DIR/managed-files.txt" "$MANIFEST_FILE"

git -C "$REPO_DIR" add -A -- content/posts app/generated/moments.json app/generated/projects.json .obsidian-publish-manifest

if git -C "$REPO_DIR" diff --cached --quiet; then
	printf '%s\n' 'no-changes' > "$RUN_DIR/status"
	log '文章与 GitHub 当前版本相同，无需创建提交'
	exit 0
fi

git -C "$REPO_DIR" config user.name 'Aspirinna Publisher'
git -C "$REPO_DIR" config user.email 'aspirinna-publisher@users.noreply.github.com'

git -C "$REPO_DIR" commit -m "publish: Obsidian content $RUN_ID"
PUBLISH_COMMIT="$(git -C "$REPO_DIR" rev-parse HEAD)"
printf '%s\n' "$PUBLISH_COMMIT" > "$RUN_DIR/publish-commit"

log '推送 GitHub；成功后 GitHub Actions 将部署正式网站'
if ! git -C "$REPO_DIR" push origin main; then
	printf '%s\n' 'push-failed' > "$RUN_DIR/status"
	fail "提交已保留在服务器：$PUBLISH_COMMIT；解决网络问题后重新执行 git push origin main"
fi

printf '%s\n' 'published' > "$RUN_DIR/status"
trap - ERR
log "发布提交：$PUBLISH_COMMIT"
log '服务器端发布完成，请到 GitHub Actions 查看正式部署结果'
