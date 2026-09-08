#!/usr/bin/env bash

set -Eeuo pipefail

STUDIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_VAULT="$(cd "$STUDIO_DIR/.." && pwd)"
LOCAL_NODE_DIR="$STUDIO_DIR/.runtime/node"
LOCAL_NODE="$LOCAL_NODE_DIR/bin/node"
LOCAL_PNPM_DIR="$STUDIO_DIR/.runtime/pnpm"
LOCAL_PNPM="$LOCAL_PNPM_DIR/node_modules/.bin/pnpm"
PYTHON_DEPS_DIR="$STUDIO_DIR/.runtime/python-packages"
LOCAL_PYTHON_BIN="$STUDIO_DIR/.runtime/python-bin"
LOCAL_UV="$STUDIO_DIR/.runtime/uv/uv"
DOWNLOAD_DIR=""
STARTUP_LOCK=""
REINSTALL=0
REBUILD=0
STAGE="检查参数"
VAULT_DIR="$DEFAULT_VAULT"
PORT="4321"
KNOWLEDGE_BASE=""
NPM_REGISTRY="https://registry.npmjs.org/"

# npm bootstraps pnpm; pnpm 11 uses its own environment-variable prefix.
# Keep both stages on the public registry even in a company-configured shell.
export npm_config_registry="$NPM_REGISTRY"
export pnpm_config_registry="$NPM_REGISTRY"

usage() {
  cat <<'EOF'
the-way-here

用法：
  ./start.sh [--vault <工作区路径>] [--knowledge-base <知识库 ID>] [--port <端口>]

参数：
  --vault <路径>  项目工作区路径；省略时使用 Studio 上一级工作区
  --knowledge-base <ID>  多知识库工作区中要打开的知识库；省略时优先个人库，否则使用 demo
  --port <端口>   本地端口，默认 4321
  --reinstall    重新校验依赖（优先复用下载缓存）
  --rebuild      强制重新构建
  -h, --help      显示帮助

支持 macOS、Linux 与 Windows WSL。首次启动需要联网。
脚本仅在缺少环境、依赖变化或构建过期时准备本地文件，然后在前台启动。
按 Ctrl+C 即可停止，服务不会留在后台。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault)
      [[ $# -ge 2 ]] || { echo "错误：--vault 后需要提供路径。" >&2; exit 2; }
      VAULT_DIR="$2"
      shift 2
      ;;
    --port)
      [[ $# -ge 2 ]] || { echo "错误：--port 后需要提供端口。" >&2; exit 2; }
      PORT="$2"
      shift 2
      ;;
    --knowledge-base)
      [[ $# -ge 2 ]] || { echo "错误：--knowledge-base 后需要提供知识库 ID。" >&2; exit 2; }
      KNOWLEDGE_BASE="$2"
      shift 2
      ;;
    --reinstall) REINSTALL=1; REBUILD=1; shift ;;
    --rebuild) REBUILD=1; shift ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "错误：未知参数 $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# Resolve user-supplied paths against the caller's directory, including spaces.
if [[ ! -d "$VAULT_DIR" ]]; then echo "错误：找不到工作区：$VAULT_DIR" >&2; exit 1; fi
VAULT_DIR="$(cd "$VAULT_DIR" && pwd)"
if [[ ! -f "$VAULT_DIR/the-way-here.config.yaml" ]]; then
  echo "错误：工作区缺少 the-way-here.config.yaml：$VAULT_DIR" >&2; exit 1
fi
if [[ ! "$PORT" =~ ^[0-9]{1,5}$ ]]; then echo "错误：端口必须是 1 到 65535 之间的整数。" >&2; exit 2; fi
PORT=$((10#$PORT))
if (( PORT < 1 || PORT > 65535 )); then echo "错误：端口必须是 1 到 65535 之间的整数。" >&2; exit 2; fi
case "$(uname -s)" in Darwin|Linux) ;; *) echo "错误：请在 macOS、Linux 或 Windows WSL 中运行本脚本。" >&2; exit 1 ;; esac

cleanup() {
  if [[ -n "$DOWNLOAD_DIR" && -d "$DOWNLOAD_DIR" ]]; then rm -rf "$DOWNLOAD_DIR"; fi
  if [[ -n "$STARTUP_LOCK" ]]; then rm -f "$STARTUP_LOCK"; fi
}
trap 'result=$?; if (( result != 0 )); then echo "启动未完成（${STAGE}）。修复上方错误后可直接重试，已完成的安装会保留。" >&2; fi; cleanup' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

download() {
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --retry 3 --connect-timeout 20 --max-time 600 --silent --show-error "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --timeout=20 --tries=3 "$1" -O "$2"
  else echo "错误：自动安装运行环境需要 curl 或 wget。" >&2; return 1; fi
}

install_local_node() {
  local platform architecture archive checksum_file expected actual node_version
  case "$(uname -s)" in
    Darwin) platform="darwin" ;;
    Linux) platform="linux" ;;
    *) echo "错误：当前系统不受自动安装 Node.js 支持：$(uname -s)。需要 Node.js 22.19 或更高版本。" >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) architecture="arm64" ;;
    x86_64|amd64) architecture="x64" ;;
    *) echo "错误：当前处理器不受自动安装 Node.js 支持：$(uname -m)。需要 Node.js 22.19 或更高版本。" >&2; exit 1 ;;
  esac
  command -v tar >/dev/null 2>&1 || { echo "错误：自动安装 Node.js 需要 tar。" >&2; exit 1; }
  mkdir -p "$STUDIO_DIR/.runtime"
  DOWNLOAD_DIR="$(mktemp -d "$STUDIO_DIR/.runtime/node-install.XXXXXX")"
  checksum_file="$DOWNLOAD_DIR/SHASUMS256.txt"
  download "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt" "$checksum_file"
  archive="$(awk -v suffix="-${platform}-${architecture}.tar.gz" '$2 ~ suffix "$" { print $2; exit }' "$checksum_file")"
  [[ -n "$archive" ]] || { echo "错误：没有找到适用于 ${platform}-${architecture} 的 Node.js 22 安装包。" >&2; exit 1; }
  echo "首次启动：正在为本项目安装本地 Node.js 22…"
  node_version="${archive#node-}"
  node_version="${node_version%-${platform}-${architecture}.tar.gz}"
  download "https://nodejs.org/dist/$node_version/$archive" "$DOWNLOAD_DIR/$archive"
  expected="$(awk -v name="$archive" '$2 == name { print $1; exit }' "$checksum_file")"
  if command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$DOWNLOAD_DIR/$archive" | awk '{ print $1 }')"
  elif command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$DOWNLOAD_DIR/$archive" | awk '{ print $1 }')"
  else
    echo "错误：无法校验 Node.js 安装包；系统需要 shasum 或 sha256sum。" >&2
    exit 1
  fi
  [[ "$actual" == "$expected" ]] || { echo "错误：Node.js 安装包校验失败，未继续安装。" >&2; exit 1; }
  mkdir -p "$DOWNLOAD_DIR/unpacked"
  tar -xzf "$DOWNLOAD_DIR/$archive" -C "$DOWNLOAD_DIR/unpacked" --strip-components=1
  "$DOWNLOAD_DIR/unpacked/bin/node" --version >/dev/null || { echo "错误：下载的 Node.js 无法在当前系统运行。Linux 需要兼容的 glibc 环境。" >&2; exit 1; }
  if [[ -d "$LOCAL_NODE_DIR" ]]; then mv "$LOCAL_NODE_DIR" "$DOWNLOAD_DIR/previous"; fi
  mv "$DOWNLOAD_DIR/unpacked" "$LOCAL_NODE_DIR"
  rm -rf "$DOWNLOAD_DIR"
  DOWNLOAD_DIR=""
}

STAGE="准备 Node.js"
if [[ -x "$LOCAL_NODE" ]]; then export PATH="$LOCAL_NODE_DIR/bin:$PATH"; hash -r; fi
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'const [major, minor] = process.versions.node.split(".").map(Number); major > 22 || (major === 22 && minor >= 19)' 2>/dev/null)" != "true" ]]; then
  install_local_node
  export PATH="$LOCAL_NODE_DIR/bin:$PATH"
  hash -r
fi

node "$STUDIO_DIR/scripts/startup-check.mjs" port "$PORT"
mkdir -p "$STUDIO_DIR/.runtime"
node "$STUDIO_DIR/scripts/startup-check.mjs" lock "$STUDIO_DIR/.runtime/startup.lock" "$$"
STARTUP_LOCK="$STUDIO_DIR/.runtime/startup.lock"
PNPM_VERSION="$(node -p 'const p = require(process.argv[1]).packageManager; if (!/^pnpm@\d+\.\d+\.\d+$/.test(p)) throw Error("packageManager 必须固定 pnpm 版本"); p.slice(5)' "$STUDIO_DIR/package.json")"

ensure_uv() {
  export UV_PYTHON_INSTALL_DIR="$STUDIO_DIR/.runtime/python"
  export UV_CACHE_DIR="$STUDIO_DIR/.runtime/uv-cache"
  if [[ -x "$LOCAL_UV" ]] && "$LOCAL_UV" --version >/dev/null 2>&1; then UV=("$LOCAL_UV")
  elif command -v uv >/dev/null 2>&1 && uv --version >/dev/null 2>&1; then UV=(uv)
  else
    echo "首次启动：正在为本项目准备 Python 安装工具…"
    download "https://astral.sh/uv/0.11.22/install.sh" "$STUDIO_DIR/.runtime/uv-installer.sh"
    UV_UNMANAGED_INSTALL="$(dirname "$LOCAL_UV")" sh "$STUDIO_DIR/.runtime/uv-installer.sh"
    UV=("$LOCAL_UV")
  fi
}

STAGE="准备 Python"
if [[ -x "$LOCAL_PYTHON_BIN/python3" ]]; then export PATH="$LOCAL_PYTHON_BIN:$PATH"; hash -r; fi
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import sys; assert sys.version_info >= (3, 9)' >/dev/null 2>&1; then
  ensure_uv
  echo "首次启动：正在为本项目安装 Python 3.12…"
  "${UV[@]}" --no-config python install 3.12 --no-bin
  PYTHON_EXECUTABLE="$("${UV[@]}" --no-config python find --managed-python 3.12)"
  mkdir -p "$LOCAL_PYTHON_BIN"
  ln -sf "$PYTHON_EXECUTABLE" "$LOCAL_PYTHON_BIN/python3"
  export PATH="$LOCAL_PYTHON_BIN:$PATH"
  hash -r
fi

if [[ -d "$VAULT_DIR/knowledge-engine" ]]; then
  export PYTHONPATH="$PYTHON_DEPS_DIR${PYTHONPATH:+:$PYTHONPATH}"
  REQUIREMENTS_FILE="$VAULT_DIR/knowledge-engine/requirements.txt"
  [[ -f "$REQUIREMENTS_FILE" ]] || { echo "错误：知识工具缺少依赖清单：$REQUIREMENTS_FILE" >&2; exit 1; }
  PYTHON_FINGERPRINT="$(node -e 'const fs=require("fs"),c=require("crypto"); console.log(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$REQUIREMENTS_FILE")"
  PREVIOUS_PYTHON_FINGERPRINT="$(cat "$STUDIO_DIR/.runtime/python-requirements.sha256" 2>/dev/null || true)"
  if ! python3 -c 'import yaml; assert 6 <= int(yaml.__version__.split(".")[0]) < 7' >/dev/null 2>&1 || [[ -n "$PREVIOUS_PYTHON_FINGERPRINT" && "$PREVIOUS_PYTHON_FINGERPRINT" != "$PYTHON_FINGERPRINT" ]]; then
    echo "正在为本项目安装 Python 依赖…"
    mkdir -p "$PYTHON_DEPS_DIR"
    if python3 -m pip --version >/dev/null 2>&1; then
      python3 -m pip install --index-url https://pypi.org/simple --disable-pip-version-check --upgrade --target "$PYTHON_DEPS_DIR" -r "$REQUIREMENTS_FILE"
    else
      ensure_uv
      "${UV[@]}" --no-config pip install --index-url https://pypi.org/simple --python "$(command -v python3)" --upgrade --target "$PYTHON_DEPS_DIR" -r "$REQUIREMENTS_FILE"
    fi
    python3 -c 'import yaml; assert 6 <= int(yaml.__version__.split(".")[0]) < 7'
  fi
  printf '%s\n' "$PYTHON_FINGERPRINT" > "$STUDIO_DIR/.runtime/python-requirements.sha256"
fi

STAGE="准备 pnpm"
if [[ -x "$LOCAL_PNPM" ]] && [[ "$("$LOCAL_PNPM" --version 2>/dev/null)" == "$PNPM_VERSION" ]]; then
  PNPM=("$LOCAL_PNPM")
elif command -v pnpm >/dev/null 2>&1 && [[ "$(pnpm --version 2>/dev/null)" == "$PNPM_VERSION" ]]; then
  PNPM=(pnpm)
else
  # Some Node installations omit npm. The official local distribution includes it.
  if ! command -v npm >/dev/null 2>&1 || ! npm --version >/dev/null 2>&1; then
    install_local_node
    export PATH="$LOCAL_NODE_DIR/bin:$PATH"
    hash -r
  fi
  echo "首次启动：正在为本项目安装本地 pnpm ${PNPM_VERSION}…"
  mkdir -p "$LOCAL_PNPM_DIR"
  npm install \
    --registry "$NPM_REGISTRY" \
    --prefix "$LOCAL_PNPM_DIR" \
    --include=dev \
    --no-save \
    --no-package-lock \
    --ignore-scripts \
    --loglevel=error \
    "pnpm@$PNPM_VERSION"
  [[ -x "$LOCAL_PNPM" && "$("$LOCAL_PNPM" --version)" == "$PNPM_VERSION" ]] || { echo "错误：本地 pnpm 安装失败。" >&2; exit 1; }
  PNPM=("$LOCAL_PNPM")
fi

if [[ "${PNPM[0]}" == "$LOCAL_PNPM" ]]; then
  export PATH="$(dirname "$LOCAL_PNPM"):$PATH"
fi

echo ""
echo "the-way-here"
echo "  工作区: $VAULT_DIR"
if [[ -n "$KNOWLEDGE_BASE" ]]; then echo "  知识库: $KNOWLEDGE_BASE"; fi
echo "  地址:  http://127.0.0.1:$PORT"
echo ""
echo "[1/4] 检查环境"
echo "  Node.js $(node --version)"
echo "  Python  $(python3 --version 2>&1)"
echo "  npm 源  $NPM_REGISTRY"
if command -v codex >/dev/null 2>&1; then
  echo "  Codex   $(codex --version 2>&1 || echo 无法运行)"
else
  echo "  Codex   未安装；阅读与编辑可用，也可在设置中配置其他模型服务"
fi

cd "$STUDIO_DIR"

STAGE="安装项目依赖"
echo "[2/4] 检查项目依赖"
if (( REINSTALL )); then node scripts/startup-cache.mjs invalidate; fi
if node scripts/startup-cache.mjs deps-check; then
  echo "  依赖未变化且安装完整，跳过安装。"
else
  node scripts/startup-cache.mjs invalidate
  CI=true "${PNPM[@]}" install --frozen-lockfile --prefer-offline --prod=false --registry "$NPM_REGISTRY"
  node scripts/startup-cache.mjs deps-save
fi
KNOWLEDGE_BASE="$(node scripts/startup-check.mjs knowledge-base "$VAULT_DIR" "$KNOWLEDGE_BASE")"
echo "  使用知识库: $KNOWLEDGE_BASE"

echo "[3/4] 构建本地服务"
# Keep the launcher on the same build path as development and CI. The web
# build prepares ignored MediaPipe/ONNX assets before Vite copies public/.
STAGE="构建本地服务"
if (( ! REBUILD )) && node scripts/startup-cache.mjs build-check; then
  echo "  代码与构建产物未变化，跳过构建。"
else
  node scripts/startup-cache.mjs build-invalidate
  "${PNPM[@]}" build
  node scripts/startup-cache.mjs build-save
fi

echo "[4/4] 正在启动服务"
echo "按 Ctrl+C 停止 the-way-here。"
echo ""

START_ARGS=(--vault "$VAULT_DIR" --port "$PORT")
if [[ -n "$KNOWLEDGE_BASE" ]]; then START_ARGS+=(--knowledge-base "$KNOWLEDGE_BASE"); fi
cleanup
STARTUP_LOCK=""
STAGE="启动服务"
exec node "$STUDIO_DIR/scripts/start.mjs" "${START_ARGS[@]}"
