'use strict';

const fs = require('fs');
const path = require('path');

const SENSITIVE_KEY_PATTERN = /(secret|password|passphrase|privatekey|private_key|token|apikey|api_key|authorization|auth)/i;

/**
 * Redacts sensitive values from report payloads.
 * @param {*} value - Value to sanitize.
 */
function redactSensitive (value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }

  return Object.keys(value).reduce(function (result, key) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? 'XXXXXXXXXX' : redactSensitive(value[key]);
    return result;
  }, {});
}

/**
 * Writes JSON and Markdown reports for one scenario run.
 * @param {object} report - Report object.
 * @param {string} reportDir - Output directory.
 */
function writeReports (report, reportDir) {
  const safeReport = redactSensitive(report);
  const runId = safeReport.run.id;
  const resolvedDir = path.resolve(process.cwd(), reportDir);

  fs.mkdirSync(resolvedDir, { recursive: true });

  const jsonPath = path.join(resolvedDir, runId + '.json');
  const markdownPath = path.join(resolvedDir, runId + '.md');

  fs.writeFileSync(jsonPath, JSON.stringify(safeReport, null, 2) + '\n');
  fs.writeFileSync(markdownPath, renderMarkdownReport(safeReport));

  return {
    jsonPath,
    markdownPath
  };
}

/**
 * Renders a concise human-readable report.
 * @param {object} report - Sanitized report object.
 */
function renderMarkdownReport (report) {
  const lines = [];

  lines.push('# ADAMANT live scenario report');
  lines.push('');
  lines.push('- Status: ' + report.status);
  lines.push('- Mode: ' + report.target.mode);
  lines.push('- Run ID: ' + report.run.id);
  lines.push('- Started: ' + report.run.startedAt);
  lines.push('- Finished: ' + report.run.finishedAt);
  lines.push('- Scenarios: ' + report.scenarios.map(function (scenario) {
    return scenario.id + '=' + scenario.status;
  }).join(', '));
  lines.push('');
  lines.push('## Targets');
  report.target.nodes.forEach(function (node) {
    lines.push('- ' + node.id + ': ' + node.apiUrl + (node.wsClientUrl ? ', WS ' + node.wsClientUrl : ''));
    if (node.generalLogFile) {
      lines.push('  - Log: ' + node.generalLogFile);
    }
  });
  lines.push('');
  lines.push('## Metrics');
  lines.push('```json');
  lines.push(JSON.stringify(report.metrics, null, 2));
  lines.push('```');

  if (report.finalNodeStates && report.finalNodeStates.length) {
    lines.push('');
    lines.push('## Final Node State');
    report.finalNodeStates.forEach(function (node) {
      lines.push('- ' + node.id + ': height ' + node.height + ', block ' + node.blockId + ', broadhash ' + node.broadhash);
    });
  }

  const failures = report.scenarios.filter(function (scenario) {
    return scenario.status === 'failed';
  });

  if (failures.length) {
    lines.push('');
    lines.push('## Failures');
    failures.forEach(function (failure) {
      lines.push('- ' + failure.id + ': ' + failure.error);
    });
  }

  return lines.join('\n') + '\n';
}

module.exports = {
  redactSensitive,
  renderMarkdownReport,
  writeReports
};
