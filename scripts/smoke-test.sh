#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080/api/v1}"
API_URL="${API_URL%/}"
if [[ "${API_URL}" != */api/v1 ]]; then
  API_URL="${API_URL}/api/v1"
fi
CHESS_USERNAME="${CHESS_USERNAME:-hikaru}"
CONCURRENT_CHESS_USERNAME="${CONCURRENT_CHESS_USERNAME:-erik}"
GAME_COUNT="${GAME_COUNT:-5}"
POLL_ATTEMPTS="${POLL_ATTEMPTS:-90}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-5}"
RUN_CONCURRENT_SMOKE="${RUN_CONCURRENT_SMOKE:-true}"

json_field() {
  local path="$1"
  python3 -c '
import json, sys
path = sys.argv[1]
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
cur = data
for part in path.split("."):
    if isinstance(cur, dict):
        cur = cur.get(part)
    else:
        cur = None
        break
if cur is None:
    sys.exit(0)
if isinstance(cur, (dict, list)):
    print(json.dumps(cur, ensure_ascii=False))
else:
    print(cur)
' "$path"
}

json_length() {
  local path="$1"
  python3 -c '
import json, sys
path = sys.argv[1]
try:
    data = json.load(sys.stdin)
except Exception:
    print(0)
    sys.exit(0)
cur = data
for part in path.split("."):
    if isinstance(cur, dict):
        cur = cur.get(part)
    else:
        cur = None
        break
print(len(cur) if isinstance(cur, (list, dict)) else 0)
' "$path"
}

fail() {
  echo "Smoke test failed: $*" >&2
  exit 1
}

request_json() {
  local method="$1"
  local url="$2"
  local payload="${3:-}"
  local body_file
  local status
  body_file="$(mktemp)"

  if [ -n "${payload}" ]; then
    status="$(curl -sS -o "${body_file}" -w "%{http_code}" -X "${method}" "${url}" \
      -H "Content-Type: application/json" \
      -d "${payload}" || true)"
  else
    status="$(curl -sS -o "${body_file}" -w "%{http_code}" -X "${method}" "${url}" || true)"
  fi

  if [ "${status}" -lt 200 ] || [ "${status}" -ge 300 ]; then
    echo "${method} ${url} returned ${status}" >&2
    cat "${body_file}" >&2
    rm -f "${body_file}"
    exit 1
  fi

  cat "${body_file}"
  rm -f "${body_file}"
}

get_summary() {
  local username="$1"
  local body_file
  local status
  body_file="$(mktemp)"
  status="$(curl -sS -o "${body_file}" -w "%{http_code}" -G "${API_URL}/player/summary" \
    --data-urlencode "platform=chess.com" \
    --data-urlencode "username=${username}" || true)"

  if [ "${status}" -lt 200 ] || [ "${status}" -ge 300 ]; then
    echo "GET ${API_URL}/player/summary returned ${status}" >&2
    cat "${body_file}" >&2
    rm -f "${body_file}"
    exit 1
  fi

  cat "${body_file}"
  rm -f "${body_file}"
}

create_analysis() {
  local username="$1"
  local payload
  payload="$(printf '{"username":"%s","platform":"chess.com","gameCount":%s,"timeControl":"all","priority":"fast"}' \
    "${username}" "${GAME_COUNT}")"
  request_json POST "${API_URL}/analysis" "${payload}"
}

record_visit() {
  local visitor_id="$1"
  local body_file
  local status
  body_file="$(mktemp)"
  status="$(curl -sS -o "${body_file}" -w "%{http_code}" -X POST "${API_URL}/site/visit" \
    -H "X-Visitor-Id: ${visitor_id}" \
    -H "User-Agent: chess-analysis-smoke-test" || true)"

  if [ "${status}" -lt 200 ] || [ "${status}" -ge 300 ]; then
    echo "POST ${API_URL}/site/visit returned ${status}" >&2
    cat "${body_file}" >&2
    rm -f "${body_file}"
    exit 1
  fi

  cat "${body_file}"
  rm -f "${body_file}"
}

assert_analysis_id() {
  local response="$1"
  local label="$2"
  local analysis_id
  analysis_id="$(printf '%s' "${response}" | json_field id)"
  if [ -z "${analysis_id}" ]; then
    echo "${label} response:" >&2
    printf '%s\n' "${response}" >&2
    fail "missing analysis id in ${label}"
  fi
  printf '%s' "${analysis_id}"
}

validate_result() {
  local analysis_id="$1"
  local result_response
  local total_games
  local avg_accuracy
  result_response="$(request_json GET "${API_URL}/analysis/${analysis_id}/result")"
  total_games="$(printf '%s' "${result_response}" | json_field totalGames)"
  avg_accuracy="$(printf '%s' "${result_response}" | json_field averageAccuracy)"

  if [ -z "${total_games}" ] || [ "${total_games}" -lt 1 ]; then
    echo "${result_response}" >&2
    fail "analysis ${analysis_id} has no stored game result"
  fi

  if [ -z "${avg_accuracy}" ]; then
    echo "${result_response}" >&2
    fail "analysis ${analysis_id} is missing averageAccuracy"
  fi
}

poll_until_done() {
  local ids=("$@")
  local completed=()
  local attempt

  for attempt in $(seq 1 "${POLL_ATTEMPTS}"); do
    local all_done="true"

    for analysis_id in "${ids[@]}"; do
      if [[ " ${completed[*]} " == *" ${analysis_id} "* ]]; then
        continue
      fi

      all_done="false"
      local status_response
      local status
      local progress
      local queue_position
      local current_step
      local error_message

      status_response="$(request_json GET "${API_URL}/analysis/${analysis_id}/status")"
      status="$(printf '%s' "${status_response}" | json_field status)"
      progress="$(printf '%s' "${status_response}" | json_field progress)"
      queue_position="$(printf '%s' "${status_response}" | json_field queuePosition)"
      current_step="$(printf '%s' "${status_response}" | json_field currentStep)"
      error_message="$(printf '%s' "${status_response}" | json_field errorMessage)"

      echo "analysis=${analysis_id} status=${status:-unknown} progress=${progress:-unknown} queue=${queue_position:-n/a} step=${current_step:-n/a}"

      case "${status}" in
        completed)
          validate_result "${analysis_id}"
          completed+=("${analysis_id}")
          ;;
        failed)
          echo "${status_response}" >&2
          fail "analysis ${analysis_id} failed: ${error_message:-unknown error}"
          ;;
      esac
    done

    if [ "${#completed[@]}" -eq "${#ids[@]}" ]; then
      echo "All analyses completed"
      return 0
    fi

    if [ "${all_done}" = "false" ]; then
      sleep "${POLL_INTERVAL_SECONDS}"
    fi
  done

  fail "timed out waiting for ${#ids[@]} analysis job(s)"
}

echo "Checking API health at ${API_URL}/actuator/health"
request_json GET "${API_URL}/actuator/health" >/dev/null

echo "Checking persistent daily-unique site visit counter"
visitor_id="smoke-${CHESS_USERNAME}"
visit_once="$(record_visit "${visitor_id}")"
visit_twice="$(record_visit "${visitor_id}")"
total_once="$(printf '%s' "${visit_once}" | json_field totalViews)"
total_twice="$(printf '%s' "${visit_twice}" | json_field totalViews)"
second_counted="$(printf '%s' "${visit_twice}" | json_field counted)"
if [ -z "${total_once}" ] || [ -z "${total_twice}" ]; then
  echo "${visit_once}" >&2
  echo "${visit_twice}" >&2
  fail "site visit response did not include totalViews"
fi
if [ "${total_twice}" -ne "${total_once}" ]; then
  echo "${visit_once}" >&2
  echo "${visit_twice}" >&2
  fail "same visitor was counted more than once in a day"
fi
if [ "${second_counted}" != "False" ] && [ "${second_counted}" != "false" ]; then
  echo "${visit_twice}" >&2
  fail "second same-day site visit should not be counted"
fi

echo "Checking player summary cache serialization for ${CHESS_USERNAME}"
summary_response="$(get_summary "${CHESS_USERNAME}")"
recent_count="$(printf '%s' "${summary_response}" | json_length recent10)"
if [ "${recent_count}" -lt 1 ]; then
  echo "${summary_response}" >&2
  fail "player summary did not include recent games"
fi
get_summary "${CHESS_USERNAME}" >/dev/null
echo "Player summary returned ${recent_count} recent game(s) and survived cache read/write"

echo "Creating analysis for ${CHESS_USERNAME}"
primary_response="$(create_analysis "${CHESS_USERNAME}")"
primary_id="$(assert_analysis_id "${primary_response}" "primary create")"
echo "Primary analysis id: ${primary_id}"

echo "Creating duplicate analysis for ${CHESS_USERNAME}; should reuse active job"
duplicate_response="$(create_analysis "${CHESS_USERNAME}")"
duplicate_id="$(assert_analysis_id "${duplicate_response}" "duplicate create")"
if [ "${duplicate_id}" != "${primary_id}" ]; then
  echo "Primary response: ${primary_response}" >&2
  echo "Duplicate response: ${duplicate_response}" >&2
  fail "duplicate same-user request created a new analysis instead of reusing the active one"
fi
echo "Duplicate request reused active analysis id: ${duplicate_id}"

analysis_ids=("${primary_id}")
if [ "${RUN_CONCURRENT_SMOKE}" = "true" ] && [ "${CONCURRENT_CHESS_USERNAME}" != "${CHESS_USERNAME}" ]; then
  echo "Creating concurrent analysis for ${CONCURRENT_CHESS_USERNAME}"
  secondary_response="$(create_analysis "${CONCURRENT_CHESS_USERNAME}")"
  secondary_id="$(assert_analysis_id "${secondary_response}" "concurrent create")"
  echo "Concurrent analysis id: ${secondary_id}"
  analysis_ids+=("${secondary_id}")
fi

echo "Polling ${#analysis_ids[@]} analysis job(s)"
poll_until_done "${analysis_ids[@]}"

echo "Smoke test passed"
