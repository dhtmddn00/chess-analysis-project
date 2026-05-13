#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080/api/v1}"
CHESS_USERNAME="${CHESS_USERNAME:-hikaru}"
GAME_COUNT="${GAME_COUNT:-5}"

echo "Checking API health at ${API_URL}/actuator/health"
curl -fsS "${API_URL}/actuator/health" >/dev/null

echo "Creating analysis for ${CHESS_USERNAME}"
response="$(curl -fsS -X POST "${API_URL}/analysis" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${CHESS_USERNAME}\",\"platform\":\"chess.com\",\"gameCount\":${GAME_COUNT},\"timeControl\":\"all\",\"priority\":\"fast\"}")"

analysis_id="$(printf '%s' "${response}" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
if [ -z "${analysis_id}" ]; then
  echo "Failed to parse analysis id from response:"
  printf '%s\n' "${response}"
  exit 1
fi

echo "Analysis id: ${analysis_id}"
echo "Polling status"

for _ in $(seq 1 30); do
  status_response="$(curl -fsS "${API_URL}/analysis/${analysis_id}/status")"
  status="$(printf '%s' "${status_response}" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
  progress="$(printf '%s' "${status_response}" | sed -n 's/.*"progress":\([0-9]*\).*/\1/p')"
  echo "status=${status:-unknown} progress=${progress:-unknown}"

  case "${status}" in
    completed)
      echo "Smoke test passed"
      exit 0
      ;;
    failed)
      echo "Analysis failed:"
      printf '%s\n' "${status_response}"
      exit 1
      ;;
  esac

  sleep 5
done

echo "Smoke test timed out waiting for completion"
exit 1
