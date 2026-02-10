#!/usr/bin/env bash
set -euo pipefail

FFMPEG_CMD=${FFMPEG_CMD:-ffmpeg}
SRC_DIR="src/assets/sounds"
DEST_DIR="public/sounds"

mkdir -p "$DEST_DIR"

shopt -s nullglob
for src in "$SRC_DIR"/*; do
  if [ ! -f "$src" ]; then
    continue
  fi
  filename=$(basename -- "$src")
  name="${filename%.*}"
  echo "Converting $filename..."

  # Try libopus for .ogg, fallback to libvorbis
  if $FFMPEG_CMD -y -i "$src" -map 0:a:0 -c:a libopus -b:a 64k "$DEST_DIR/${name}.ogg" 2>/dev/null; then
    echo " -> $name.ogg (opus)"
  else
    echo " -> libopus failed, falling back to libvorbis for $name.ogg"
    $FFMPEG_CMD -y -i "$src" -map 0:a:0 -c:a libvorbis -q:a 5 "$DEST_DIR/${name}.ogg"
  fi

  # Create m4a (AAC)
  $FFMPEG_CMD -y -i "$src" -map 0:a:0 -c:a aac -b:a 64k "$DEST_DIR/${name}.m4a"
  echo " -> $name.m4a"
done

echo "Conversion complete. Output in $DEST_DIR"
