#!/usr/bin/env bash
# 往决策日志追加一行。日志是 TSV，只追加，不改历史。
# 改编自 pstack 的 show-me-your-work/scripts/log.sh（MIT，Lauren Tan）。
# 用法：log.sh <日志文件> <阶段> <决定> <原因> <证据> <结果>
set -euo pipefail

if [ "$#" -ne 6 ]; then
	printf 'usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>\n' >&2
	exit 1
fi

logfile="$1"
shift

logdir="$(dirname "$logfile")"
if [ -n "$logdir" ] && [ "$logdir" != "." ] && [ ! -d "$logdir" ]; then
	mkdir -p "$logdir"
fi

# 用 >> 而不是 >：网络盘上这个判断可能对一个已存在的文件失败，代价只是一行多余的表头。
if [ ! -s "$logfile" ]; then
	printf 'ts\tphase\tdecision\twhy\tevidence\tresult\n' >> "$logfile"
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# 去掉制表符和换行，让单元格保持单行；以 = + - @ 开头的单元格前面加一个单引号，
# 免得别人提供的文本在表格软件里变成公式。
clean() {
	local v
	v=$(printf '%s' "$1" | tr '\t\n\r' '   ')
	case "$v" in
		=*|+*|-*|@*) printf "'%s" "$v" ;;
		*) printf '%s' "$v" ;;
	esac
}
printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$ts" "$(clean "$1")" "$(clean "$2")" "$(clean "$3")" "$(clean "$4")" "$(clean "$5")" \
	>> "$logfile"
