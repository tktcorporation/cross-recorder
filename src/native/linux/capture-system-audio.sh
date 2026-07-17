#!/usr/bin/env bash
# capture-system-audio.sh
# Captures system audio on Linux using PipeWire (pw-cat) or PulseAudio (parec).
# Outputs raw PCM Int16LE interleaved data on stdout.
# Status messages as JSON on stderr.
#
# Usage: capture-system-audio.sh [--sample-rate 48000] [--channels 2] [--check]
# Output: Raw PCM Int16LE on stdout
# Status: JSON on stderr ({"status":"started"}, {"level":...}, {"error":"..."})
# Stop:   SIGTERM or SIGINT
#
# PipeWire の pw-cat がシステムの既定モニターソースを録音し、
# PCM Int16LE を stdout に出力する。PipeWire がなければ PulseAudio の
# parec にフォールバックする。

SAMPLE_RATE=48000
CHANNELS=2
CHECK_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sample-rate)
      SAMPLE_RATE="$2"
      shift 2
      ;;
    --channels)
      CHANNELS="$2"
      shift 2
      ;;
    --check)
      CHECK_ONLY=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

write_status() {
  echo "$1" >&2
}

# Detect available audio backend
BACKEND=""
if command -v pw-cat >/dev/null 2>&1; then
  BACKEND="pipewire"
elif command -v parec >/dev/null 2>&1; then
  BACKEND="pulseaudio"
fi

if [[ -z "$BACKEND" ]]; then
  write_status '{"error":"No supported audio backend found. Install PipeWire (pw-cat) or PulseAudio (parec)."}'
  exit 1
fi

# --check mode: verify audio backend is available and exit
if [[ "$CHECK_ONLY" == "true" ]]; then
  if [[ "$BACKEND" == "pipewire" ]]; then
    if command -v pw-cli >/dev/null 2>&1; then
      # pw-cat に対象一覧を取得するオプションはない。PipeWire デーモンに
      # 接続できるかどうかを pw-cli info で確認する。
      if pw-cli info 0 >/dev/null 2>&1; then
        write_status '{"check":"ok"}'
        exit 0
      else
        write_status '{"check":"error","reason":"PipeWire is available but cannot connect to the daemon"}'
        exit 1
      fi
    else
      # pw-cli が別パッケージに分かれているディストリビューションでは
      # 未導入のことがある。デーモン到達性を個別確認する手段がないため、
      # pw-cat バイナリの存在をもって ok とする。実際に接続できない場合は
      # 録音開始時のプロセス起動チェック（kill -0 / 終了コード監視）で
      # エラーとして検知される。
      write_status '{"check":"ok"}'
      exit 0
    fi
  elif [[ "$BACKEND" == "pulseaudio" ]]; then
    if pactl info >/dev/null 2>&1; then
      write_status '{"check":"ok"}'
      exit 0
    else
      write_status '{"check":"error","reason":"PulseAudio is available but pactl info failed"}'
      exit 1
    fi
  fi
fi

# Set up signal handler for graceful shutdown
CHILD_PID=""
cleanup() {
  if [[ -n "$CHILD_PID" ]] && kill -0 "$CHILD_PID" 2>/dev/null; then
    kill "$CHILD_PID" 2>/dev/null
    wait "$CHILD_PID" 2>/dev/null
  fi
  write_status '{"status":"stopped"}'
  exit 0
}
trap cleanup SIGTERM SIGINT

# Start capture
# pw-cat / parec はモニターソースからPCMを標準出力に書き出す。
# デフォルトのモニターソースが自動選択される（全システム音声）。
if [[ "$BACKEND" == "pipewire" ]]; then
  # pw-cat --record でモニターストリームをキャプチャ。
  # --target=0 は pw_stream_connect() の PW_STREAM_FLAG_AUTOCONNECT を
  # 落として自動リンク自体を無効化してしまうため、stream.capture.sink=true
  # と併用しても効果がない（後者は自動リンクが行われる場合に「どのノードへ
  # 繋ぐか」を既定シンクのモニターへ誘導するだけ）。--target は省略して既定の
  # auto のままにし、stream.capture.sink=true だけで
  # 「聞こえている音を録音する」既定シンクのモニターへリンクさせる。
  PW_CAT_ARGS=(
    --record
    --format=s16
    --rate="$SAMPLE_RATE"
    --channels="$CHANNELS"
    -P '{ stream.capture.sink=true }'
  )
  # 標準出力 (-) への出力は既定で AU コンテナが付与され、生の PCM にならない
  # (pw-cat --raw を指定しない限り libsndfile が .au 形式でヘッダーを書く)。
  # --raw は比較的新しいバージョンの pw-cat にのみ存在するため、未対応の
  # バージョンに渡すと起動時エラーになる。--help に現れる場合のみ追加する。
  if pw-cat --help 2>&1 | grep -q -- '--raw'; then
    PW_CAT_ARGS+=(--raw)
  fi
  pw-cat "${PW_CAT_ARGS[@]}" - &
  CHILD_PID=$!
elif [[ "$BACKEND" == "pulseaudio" ]]; then
  # parec でデフォルトモニターソースからキャプチャ
  parec \
    --format=s16le \
    --rate="$SAMPLE_RATE" \
    --channels="$CHANNELS" \
    --device="@DEFAULT_MONITOR@" \
    --raw &
  CHILD_PID=$!
fi

# キャプチャプロセスの起動を少し待って確認
sleep 0.3
if ! kill -0 "$CHILD_PID" 2>/dev/null; then
  write_status "{\"error\":\"$BACKEND capture process failed to start\"}"
  exit 1
fi

write_status '{"status":"started"}'

# 子プロセスの終了を待つ
wait "$CHILD_PID"
EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 ]]; then
  write_status "{\"error\":\"$BACKEND capture process exited with code $EXIT_CODE\"}"
fi

write_status '{"status":"stopped"}'
exit $EXIT_CODE
