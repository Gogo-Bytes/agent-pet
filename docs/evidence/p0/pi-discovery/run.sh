#!/bin/sh
set -eu
# Usage: sh run.sh /absolute/path/to/pi-coding-agent /absolute/path/to/node
PACKAGE=$1
NODE=$2
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
ROOT=$(mktemp -d /tmp/ap-pi-discovery.XXXXXX)
trap 'rm -rf "$ROOT"' EXIT HUP INT TERM
cp "$HERE/probe.mjs" "$ROOT/probe.mjs"
mkdir -p "$ROOT/home" "$ROOT/tmp" "$ROOT/env-agent"
cd -P "$ROOT"
env -i HOME="$PWD/home" TMPDIR="$PWD/tmp" PI_CODING_AGENT_DIR="$PWD/env-agent" PI_CODING_AGENT_SESSION_DIR="$PWD/sessions" PI_PACKAGE_DIR="$PACKAGE" PI_OFFLINE=1 PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 "$NODE" --permission --allow-fs-read="$PWD" --allow-fs-read="$PACKAGE" --allow-fs-write="$PWD" probe.mjs
cp results.json "$HERE/results.json"
