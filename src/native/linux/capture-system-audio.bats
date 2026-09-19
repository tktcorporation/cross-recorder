#!/usr/bin/env bats
# capture-system-audio.bats
#
# capture-system-audio.sh のバックエンド選択・--check・起動失敗検知・
# SIGTERM ハンドリングを、pw-cat/pw-cli/parec/pactl の偽実行ファイルを
# PATH へ差し込んで検証する。実際の PipeWire/PulseAudio デーモンには
# 依存しない。

SCRIPT="$BATS_TEST_DIRNAME/capture-system-audio.sh"

setup() {
  STUB_BIN="$(mktemp -d)"
  WORK_DIR="$(mktemp -d)"
  # スタブは capture-system-audio.sh の子プロセスとして起動されるため、
  # 引数キャプチャ先を教えるには環境変数として export する必要がある
  # （plain なシェル変数は子プロセスへ継承されない）。
  export WORK_DIR

  # capture-system-audio.sh 自身が使う外部コマンド（bash 自体の解決、
  # grep、sleep。kill/wait/trap/echo/command はいずれも bash 組み込み）
  # だけを含む隔離ディレクトリを用意する。継承した $PATH をそのまま後ろに
  # 残すと、実行環境に本物の pw-cat/parec がインストールされていた場合に
  # 「バックエンドが見つからない」系のテストが偽陰性になるため、テスト対象
  # コマンドの解決を STUB_BIN と、この隔離ディレクトリだけに限定する。
  ISOLATED_BIN="$(mktemp -d)"
  ln -s "$(command -v bash)" "$ISOLATED_BIN/bash"
  ln -s "$(command -v sleep)" "$ISOLATED_BIN/sleep"
  ln -s "$(command -v grep)" "$ISOLATED_BIN/grep"
  TEST_PATH="$STUB_BIN:$ISOLATED_BIN"
}

teardown() {
  rm -rf "$STUB_BIN" "$WORK_DIR" "$ISOLATED_BIN"
}

# stub <name> — 標準入力で渡したスクリプト本体を STUB_BIN/<name> として
# 実行可能ファイルに書き出す。PATH の先頭に STUB_BIN を差し込むことで、
# capture-system-audio.sh から見た pw-cat 等の挙動を差し替える。
stub() {
  cat >"$STUB_BIN/$1"
  chmod +x "$STUB_BIN/$1"
}

# run_script <args...> — capture-system-audio.sh を隔離 PATH 付きで実行し、
# 標準出力・標準エラーを WORK_DIR 配下のファイルへ保存する。終了コードを
# 標準出力へ書き出すので、呼び出し側は `status=$(run_script ...)` で拾う。
run_script() {
  PATH="$TEST_PATH" "$SCRIPT" "$@" \
    >"$WORK_DIR/stdout" 2>"$WORK_DIR/stderr"
  echo "$?"
}

@test "streams raw PCM via the pipewire backend when pw-cat supports --raw" {
  # capture-system-audio.sh は子プロセス起動から 0.3 秒後に生存確認をする
  # ため、スタブは出力直後に終了せず、その確認を通過するまで待ってから
  # 正常終了する。
  stub pw-cat <<'STUB'
#!/usr/bin/env bash
if [[ "$1" == "--help" ]]; then
  echo "Usage: pw-cat [options] --raw ..."
  exit 0
fi
printf '%s\n' "$@" >"$WORK_DIR/pw-cat-args"
printf '\x01\x02\x03\x04'
sleep 0.5
STUB

  status=$(run_script --sample-rate 48000 --channels 2)
  [ "$status" -eq 0 ]
  grep -q '"status":"started"' "$WORK_DIR/stderr"
  grep -q '"status":"stopped"' "$WORK_DIR/stderr"
  [ "$(wc -c <"$WORK_DIR/stdout")" -eq 4 ]

  # 引数の組み立てが壊れても他のアサーションは緑のままになりうるため、
  # pw-cat へ実際に渡った引数を行単位で検証する。-P の値は空白を含む
  # 1 引数として渡る想定なので、grep -x（行完全一致）で分割されていない
  # ことも確認する。
  grep -qx -- "--record" "$WORK_DIR/pw-cat-args"
  grep -qx -- "--format=s16" "$WORK_DIR/pw-cat-args"
  grep -qx -- "--rate=48000" "$WORK_DIR/pw-cat-args"
  grep -qx -- "--channels=2" "$WORK_DIR/pw-cat-args"
  grep -qx -- "-P" "$WORK_DIR/pw-cat-args"
  grep -qx -- "{ stream.capture.sink=true }" "$WORK_DIR/pw-cat-args"
  grep -qx -- "--raw" "$WORK_DIR/pw-cat-args"
}

@test "streams raw PCM via the pulseaudio backend when pw-cat is absent" {
  stub parec <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$@" >"$WORK_DIR/parec-args"
printf '\xaa\xbb'
sleep 0.5
STUB

  status=$(run_script --sample-rate 44100 --channels 1)
  [ "$status" -eq 0 ]
  grep -q '"status":"started"' "$WORK_DIR/stderr"
  grep -q '"status":"stopped"' "$WORK_DIR/stderr"
  [ "$(wc -c <"$WORK_DIR/stdout")" -eq 2 ]

  grep -qx -- "--format=s16le" "$WORK_DIR/parec-args"
  grep -qx -- "--rate=44100" "$WORK_DIR/parec-args"
  grep -qx -- "--channels=1" "$WORK_DIR/parec-args"
  grep -qx -- "--device=@DEFAULT_MONITOR@" "$WORK_DIR/parec-args"
  grep -qx -- "--raw" "$WORK_DIR/parec-args"
}

@test "errors out instead of hanging when --sample-rate is given without a value" {
  # 値の有無を確認せず shift 2 していた頃は、$# が減らないまま while
  # ループが無限に回り続けた（回帰時に CI がハングしないよう timeout で
  # 上限を設ける）。
  status=$(timeout 3 "$SCRIPT" --sample-rate \
    >"$WORK_DIR/stdout" 2>"$WORK_DIR/stderr"; echo "$?")
  [ "$status" -eq 1 ]
  grep -q "requires a numeric value" "$WORK_DIR/stderr"
}

@test "errors out when --sample-rate is given a non-numeric value" {
  status=$(run_script --sample-rate --channels 2)
  [ "$status" -eq 1 ]
  grep -q "requires a numeric value" "$WORK_DIR/stderr"
}

@test "errors out on an unknown option instead of silently ignoring it" {
  status=$(run_script --sampleRate 48000)
  [ "$status" -eq 1 ]
  grep -q "unknown option" "$WORK_DIR/stderr"
}

@test "errors out when pw-cat lacks --raw support and parec is absent" {
  stub pw-cat <<'STUB'
#!/usr/bin/env bash
if [[ "$1" == "--help" ]]; then
  echo "Usage: pw-cat [options] (no raw output support)"
  exit 0
fi
exit 1
STUB

  status=$(run_script --sample-rate 48000)
  [ "$status" -eq 1 ]
  grep -q '"error"' "$WORK_DIR/stderr"
  grep -q -- "--raw" "$WORK_DIR/stderr"
}

@test "errors out when neither pipewire nor pulseaudio backend is found" {
  status=$(run_script --sample-rate 48000)
  [ "$status" -eq 1 ]
  grep -q "No supported audio backend found" "$WORK_DIR/stderr"
}

@test "--check on the pipewire backend reports ok when pw-cli reaches the daemon" {
  stub pw-cat <<'STUB'
#!/usr/bin/env bash
if [[ "$1" == "--help" ]]; then
  echo "supports --raw"
  exit 0
fi
exit 0
STUB
  stub pw-cli <<'STUB'
#!/usr/bin/env bash
exit 0
STUB

  status=$(run_script --check)
  [ "$status" -eq 0 ]
  grep -q '"check":"ok"' "$WORK_DIR/stderr"
}

@test "--check on the pipewire backend reports ok when pw-cli is absent (lenient fallback)" {
  # pw-cli が別パッケージに分かれているディストリビューションでは未導入の
  # ことがあるため、capture-system-audio.sh は pw-cli 不在時にデーモン
  # 到達性を確認せず pw-cat の存在だけで ok を返す（capture-system-audio.sh
  # のコメント参照）。この分岐を明示的に検証する。
  stub pw-cat <<'STUB'
#!/usr/bin/env bash
if [[ "$1" == "--help" ]]; then
  echo "supports --raw"
  exit 0
fi
exit 0
STUB

  status=$(run_script --check)
  [ "$status" -eq 0 ]
  grep -q '"check":"ok"' "$WORK_DIR/stderr"
}

@test "--check on the pipewire backend reports an error when pw-cli cannot reach the daemon" {
  stub pw-cat <<'STUB'
#!/usr/bin/env bash
if [[ "$1" == "--help" ]]; then
  echo "supports --raw"
  exit 0
fi
exit 0
STUB
  stub pw-cli <<'STUB'
#!/usr/bin/env bash
exit 1
STUB

  status=$(run_script --check)
  [ "$status" -eq 1 ]
  grep -q '"check":"error"' "$WORK_DIR/stderr"
  grep -q "cannot connect to the daemon" "$WORK_DIR/stderr"
}

@test "--check on the pulseaudio backend reports ok when pactl info succeeds" {
  stub parec <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
  stub pactl <<'STUB'
#!/usr/bin/env bash
exit 0
STUB

  status=$(run_script --check)
  [ "$status" -eq 0 ]
  grep -q '"check":"ok"' "$WORK_DIR/stderr"
}

@test "--check on the pulseaudio backend reports an error when pactl info fails" {
  stub parec <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
  stub pactl <<'STUB'
#!/usr/bin/env bash
exit 1
STUB

  status=$(run_script --check)
  [ "$status" -eq 1 ]
  grep -q '"check":"error"' "$WORK_DIR/stderr"
  grep -q "pactl info failed" "$WORK_DIR/stderr"
}

@test "errors out when the backend process exits immediately after starting" {
  stub pw-cat <<'STUB'
#!/usr/bin/env bash
if [[ "$1" == "--help" ]]; then
  echo "supports --raw"
  exit 0
fi
exit 7
STUB

  status=$(run_script --sample-rate 48000)
  [ "$status" -eq 1 ]
  grep -q "failed to start" "$WORK_DIR/stderr"
}

@test "responds to SIGTERM with a stopped status and exits" {
  stub pw-cat <<'STUB'
#!/usr/bin/env bash
if [[ "$1" == "--help" ]]; then
  echo "supports --raw"
  exit 0
fi
trap 'exit 0' TERM
while true; do sleep 0.05; done
STUB

  PATH="$TEST_PATH" "$SCRIPT" --sample-rate 48000 \
    >"$WORK_DIR/stdout" 2>"$WORK_DIR/stderr" &
  local pid=$!

  for _ in $(seq 1 50); do
    grep -q '"status":"started"' "$WORK_DIR/stderr" 2>/dev/null && break
    sleep 0.05
  done
  grep -q '"status":"started"' "$WORK_DIR/stderr"

  kill -TERM "$pid"
  wait "$pid"
  local exit_status=$?

  [ "$exit_status" -eq 0 ]
  grep -q '"status":"stopped"' "$WORK_DIR/stderr"
}
