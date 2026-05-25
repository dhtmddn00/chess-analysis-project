"""
Prometheus metrics for Chess Analysis Worker.

Starts an HTTP server on METRICS_PORT (default 8001) that Prometheus scrapes.
Import `start_metrics_server()` from main.py once at startup, then use the
module-level metric objects anywhere in the codebase.
"""

import os
from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    start_http_server,
)

# ── Job-level counters ───────────────────────────────────────────────────────

JOBS_TOTAL = Counter(
    "worker_jobs_total",
    "Total number of analysis jobs picked up from the queue",
    ["status"],           # labels: completed | failed_fatal | failed_transient
)

# ── Per-phase duration histograms ────────────────────────────────────────────

PHASE_DURATION = Histogram(
    "worker_phase_duration_seconds",
    "Time spent in each analysis phase",
    ["phase"],            # fetch | parse | store_games | stockfish | store_results | profile | complete
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600],
)

# ── Total job duration ───────────────────────────────────────────────────────

JOB_DURATION = Histogram(
    "worker_job_duration_seconds",
    "End-to-end wall-clock time per analysis job",
    buckets=[5, 15, 30, 60, 120, 300, 600, 1200],
)

# ── In-flight jobs ───────────────────────────────────────────────────────────

JOBS_IN_FLIGHT = Gauge(
    "worker_jobs_in_flight",
    "Number of analysis jobs currently being processed",
)

# ── Games processed per job ──────────────────────────────────────────────────

GAMES_PER_JOB = Histogram(
    "worker_games_per_job",
    "Number of valid games analysed in a single job",
    buckets=[1, 5, 10, 20, 30, 50, 75, 100],
)


def start_metrics_server() -> None:
    """Start the Prometheus HTTP metrics server.

    Port is read from the ``METRICS_PORT`` environment variable (default 8001).
    Call this once at worker startup, before the main event loop begins.
    """
    port = int(os.getenv("METRICS_PORT", "8001"))
    start_http_server(port)
    # loguru not imported here to avoid circular imports — use stdlib logging
    import logging
    logging.getLogger(__name__).info(f"Prometheus metrics server started on :{port}")
