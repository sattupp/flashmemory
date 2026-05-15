#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8080/api}"
NS="${NS:-user:smoke}"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }
}

require curl
require jq

echo "API_BASE=$API_BASE"
echo "NS=$NS"

uri() {
  jq -sRr @uri <<<"$1"
}

store() {
  local value="$1"
  local priority="${2:-7}"
  local ttl="${3:-120}"
  local tags_json="${4:-[\"smoke\",\"test\"]}"

  curl -sS "$API_BASE/memories" \
    -H "Content-Type: application/json" \
    -d "{\"namespace\":\"$NS\",\"value\":\"$value\",\"priority\":$priority,\"ttlSeconds\":$ttl,\"tags\":$tags_json}" \
    | jq .
}

get_top() {
  curl -sS "$API_BASE/memories/$(uri "$NS")/top?limit=20" | jq .
}

get_one() {
  local id="$1"
  curl -sS "$API_BASE/memories/$(uri "$NS")/$id" | jq .
}

search() {
  local kw="$1"
  curl -sS "$API_BASE/memories/$(uri "$NS")/search?keyword=$(uri "$kw")&limit=20" | jq .
}

delete_one() {
  local id="$1"
  curl -sS -X DELETE "$API_BASE/memories/$(uri "$NS")/$id" -o /dev/null -w "%{http_code}\n"
}

echo
echo "1) Store memory A"
MEM_A_JSON="$(store "smoke A: dark mode" 9 120 '[\"ui\",\"preference\"]')"
MEM_A_ID="$(echo "$MEM_A_JSON" | jq -r '.id')"
test -n "$MEM_A_ID"
echo "Stored A id=$MEM_A_ID"

echo
echo "2) Store memory B"
MEM_B_JSON="$(store "smoke B: interview system design" 8 120 '[\"career\",\"interview\"]')"
MEM_B_ID="$(echo "$MEM_B_JSON" | jq -r '.id')"
test -n "$MEM_B_ID"
echo "Stored B id=$MEM_B_ID"

echo
echo "3) Top memories"
get_top | jq -e '.memories | length >= 2' >/dev/null
echo "OK"

echo
echo "4) Retrieve A (boosts usageCount)"
BEFORE_UC="$(get_one "$MEM_A_ID" | jq -r '.usageCount')"
AFTER_UC="$(get_one "$MEM_A_ID" | jq -r '.usageCount')"
if [ "$AFTER_UC" -le "$BEFORE_UC" ]; then
  echo "Expected usageCount to increase: before=$BEFORE_UC after=$AFTER_UC" >&2
  exit 1
fi
echo "OK (usageCount $BEFORE_UC -> $AFTER_UC)"

echo
echo "5) Keyword search"
search "system design" | jq -e '.memories | length >= 1' >/dev/null
echo "OK"

echo
echo "6) Delete B (fully removed)"
CODE="$(delete_one "$MEM_B_ID")"
if [ "$CODE" != "204" ]; then
  echo "Expected 204, got $CODE" >&2
  exit 1
fi
TOP_AFTER_DELETE="$(get_top)"
echo "$TOP_AFTER_DELETE" | jq -e --arg id "$MEM_B_ID" '.memories | map(.id) | index($id) | not' >/dev/null
echo "OK"

echo
echo "7) TTL expiry cleanup (A expires in ~120s)"
echo "Waiting 130s..."
sleep 130
TOP_AFTER_TTL="$(get_top)"
echo "$TOP_AFTER_TTL" | jq -e --arg id "$MEM_A_ID" '.memories | map(.id) | index($id) | not' >/dev/null
echo "OK"

echo
echo "Smoke test complete."
