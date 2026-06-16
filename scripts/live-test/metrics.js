'use strict';

/**
 * Collects scenario timing, counters, and HTTP latency values.
 */
class MetricsCollector {
  /**
   * Creates an empty metrics collector for one scenario run.
   */
  constructor () {
    this.startedAt = new Date().toISOString();
    this.counters = {};
    this.latencies = {};
  }

  /**
   * Increments a named counter.
   * @param {string} name - Counter name.
   * @param {number} [value] - Increment amount.
   */
  increment (name, value) {
    this.counters[name] = (this.counters[name] || 0) + (value === undefined ? 1 : value);
  }

  /**
   * Records one latency measurement.
   * @param {string} name - Metric name.
   * @param {number} latencyMs - Latency in milliseconds.
   */
  latency (name, latencyMs) {
    if (!this.latencies[name]) {
      this.latencies[name] = [];
    }

    this.latencies[name].push(latencyMs);
  }

  /**
   * Returns a report-friendly metrics snapshot.
   */
  snapshot () {
    const latencySummary = {};

    Object.keys(this.latencies).forEach((name) => {
      latencySummary[name] = summarizeNumbers(this.latencies[name]);
    });

    return {
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      counters: this.counters,
      latencies: latencySummary
    };
  }
}

/**
 * Summarizes numeric samples.
 * @param {Array<number>} values - Numeric samples.
 */
function summarizeNumbers (values) {
  const sorted = values.slice().sort(function (a, b) {
    return a - b;
  });

  if (!sorted.length) {
    return {
      count: 0,
      min: null,
      max: null,
      avg: null,
      p95: null
    };
  }

  const total = sorted.reduce(function (sum, value) {
    return sum + value;
  }, 0);

  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round((total / sorted.length) * 100) / 100,
    p95: percentile(sorted, 0.95)
  };
}

/**
 * Returns a nearest-rank percentile.
 * @param {Array<number>} sorted - Sorted numeric samples.
 * @param {number} fraction - Percentile fraction.
 */
function percentile (sorted, fraction) {
  if (!sorted.length) {
    return null;
  }

  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

module.exports = {
  MetricsCollector,
  summarizeNumbers
};
