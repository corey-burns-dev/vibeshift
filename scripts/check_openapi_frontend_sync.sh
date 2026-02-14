#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC_FILE="${ROOT_DIR}/backend/docs/swagger.yaml"
CLIENT_FILE="${ROOT_DIR}/frontend/src/api/client.ts"

if [[ ! -f "${SPEC_FILE}" ]]; then
  echo "missing spec file: ${SPEC_FILE}" >&2
  exit 1
fi

if [[ ! -f "${CLIENT_FILE}" ]]; then
  echo "missing client file: ${CLIENT_FILE}" >&2
  exit 1
fi

tmp_paths="$(mktemp)"
tmp_spec_paths="$(mktemp)"
trap 'rm -f "${tmp_paths}" "${tmp_spec_paths}"' EXIT

perl -0777 -ne 'while (/this\.request\(\s*(`[^`]*`|"[^"]*"|'\''[^'\'']*'\'')/g) { print "$1\n" }' "${CLIENT_FILE}" > "${tmp_paths}"

normalize_path() {
  local p="$1"
  p="${p#\`}"
  p="${p%\`}"
  p="${p#\'}"
  p="${p%\'}"
  p="${p#\"}"
  p="${p%\"}"
  p="$(printf '%s' "${p}" | sed -E 's/\$\{[^}]+\}/{param}/g')"
  p="${p%%\?*}"
  printf '%s' "${p}"
}

normalize_spec_path() {
  printf '%s' "$1" | sed -E 's/\{[^}]+\}/{param}/g'
}

declare -a missing=()
declare -A missing_set=()

grep '^  /.*:$' "${SPEC_FILE}" \
  | sed -E 's/^  (\/.*):$/\1/; s/\{[^}]+\}/{param}/g' \
  | sort -u > "${tmp_spec_paths}"

while IFS= read -r raw; do
  [[ -z "${raw}" ]] && continue
  path="$(normalize_path "${raw}")"
  # queryString suffixes can become trailing "{param}" after template normalization.
  if [[ "${path}" == *"{param}" && "${path}" != *"/{param}" ]]; then
    path="${path%\{param\}}"
  fi
  [[ -z "${path}" ]] && continue
  [[ "${path}" == "/" ]] && continue

  # Current OpenAPI coverage is limited; enforce sync for documented API groups.
  case "${path}" in
    /auth*|/sanctums*|/streams*|/admin*|/ws*)
      ;;
    *)
      continue
      ;;
  esac

  normalized_path="$(normalize_spec_path "${path}")"
  if ! grep -Fxq "${normalized_path}" "${tmp_spec_paths}"; then
    if [[ -z "${missing_set[${path}]:-}" ]]; then
      missing+=("${path}")
      missing_set["${path}"]=1
    fi
  fi
done < "${tmp_paths}"

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "frontend API endpoints not found in OpenAPI spec:" >&2
  printf ' - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "frontend endpoint paths are aligned with OpenAPI paths"
