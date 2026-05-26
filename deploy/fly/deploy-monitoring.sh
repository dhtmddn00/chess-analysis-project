#!/usr/bin/env bash
# deploy-monitoring.sh
#
# Fly.io에 Prometheus + Grafana를 배포하는 스크립트.
# 최초 1회만 실행. 이후 설정 변경 시에는 fly deploy만 재실행.
#
# 사전 조건:
#   - fly CLI 설치 및 로그인 완료 (fly auth whoami)
#   - 프로젝트 루트에서 실행
#
# 사용법:
#   chmod +x deploy/fly/deploy-monitoring.sh
#   ./deploy/fly/deploy-monitoring.sh

set -euo pipefail

REGION="nrt"
PROMETHEUS_APP="chess-analysis-prometheus"
GRAFANA_APP="chess-analysis-grafana"

echo "▶ Step 1: Prometheus 앱 생성"
fly apps create "$PROMETHEUS_APP" --org personal 2>/dev/null || echo "  (이미 존재 — skip)"

echo "▶ Step 2: Prometheus 볼륨 생성 (최초 1회만)"
fly volumes create prometheus_data \
  --size 3 \
  --region "$REGION" \
  --app "$PROMETHEUS_APP" \
  --count 1 2>/dev/null || echo "  (이미 존재 — skip)"

echo "▶ Step 3: Prometheus 배포"
fly deploy \
  --config deploy/fly/prometheus.fly.toml \
  --dockerfile deploy/fly/Dockerfile.prometheus \
  --app "$PROMETHEUS_APP"

echo ""
echo "▶ Step 4: Grafana 앱 생성"
fly apps create "$GRAFANA_APP" --org personal 2>/dev/null || echo "  (이미 존재 — skip)"

echo "▶ Step 5: Grafana 볼륨 생성 (최초 1회만)"
fly volumes create grafana_data \
  --size 5 \
  --region "$REGION" \
  --app "$GRAFANA_APP" \
  --count 1 2>/dev/null || echo "  (이미 존재 — skip)"

echo "▶ Step 6: Grafana 관리자 비밀번호 설정"
echo "  Grafana 비밀번호를 입력하세요 (엔터로 건너뛰면 기본값 사용):"
read -r -s GF_PASSWORD
if [[ -n "$GF_PASSWORD" ]]; then
  fly secrets set "GF_SECURITY_ADMIN_PASSWORD=$GF_PASSWORD" --app "$GRAFANA_APP"
else
  echo "  ⚠ 비밀번호를 설정하지 않았습니다. 나중에 반드시 설정하세요:"
  echo "  fly secrets set GF_SECURITY_ADMIN_PASSWORD=강한비밀번호 --app $GRAFANA_APP"
fi

echo "▶ Step 7: Grafana 배포"
fly deploy \
  --config deploy/fly/grafana.fly.toml \
  --app "$GRAFANA_APP"

echo ""
echo "✅ 배포 완료"
echo ""
echo "  Grafana URL : https://$GRAFANA_APP.fly.dev"
echo "  Prometheus  : fly proxy 9090 -a $PROMETHEUS_APP (로컬 접근 시)"
echo ""
echo "  Grafana 최초 설정:"
echo "  1. https://$GRAFANA_APP.fly.dev 접속"
echo "  2. Connections → Data sources → Add → Prometheus"
echo "     URL: http://$PROMETHEUS_APP.internal:9090"
echo "  3. 대시보드 JSON import: monitoring/grafana/dashboards/chess-analysis.json"
