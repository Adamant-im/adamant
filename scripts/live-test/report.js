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
    result[key] = shouldRedactKey(key) ? 'XXXXXXXXXX' : redactSensitive(value[key]);
    return result;
  }, {});
}

/**
 * Checks whether a report key should be redacted.
 * @param {string} key - Object key.
 */
function shouldRedactKey (key) {
  // Counts reveal only localnet topology, not the underlying passphrases.
  if (/count$/i.test(key)) {
    return false;
  }

  return SENSITIVE_KEY_PATTERN.test(key);
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

  const transactionRows = collectTransactionRows(report.scenarios);

  if (transactionRows.length) {
    lines.push('');
    lines.push('## Transactions');
    transactionRows.forEach(function (transaction) {
      lines.push('- ' + formatTransactionRow(transaction));
    });
  }

  const abuseRows = collectAbuseRows(report.scenarios);

  if (abuseRows.length) {
    lines.push('');
    lines.push('## Security Abuse Details');
    abuseRows.forEach(function (check) {
      lines.push('- ' + formatAbuseRow(check));
    });
  }

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

/**
 * Collects security abuse check summaries from scenario result payloads.
 * @param {Array<object>} scenarios - Scenario report entries.
 */
function collectAbuseRows (scenarios) {
  const rows = [];

  scenarios.forEach(function (scenario) {
    const result = scenario.result || {};

    (result.checks || []).forEach(function (check) {
      rows.push(Object.assign({
        scenarioId: scenario.id,
        kind: 'check'
      }, check));
    });

    if (result.overload) {
      rows.push(Object.assign({
        scenarioId: scenario.id,
        kind: 'overload'
      }, result.overload));
    }
  });

  return rows;
}

/**
 * Collects transaction summaries from scenario result payloads.
 * @param {Array<object>} scenarios - Scenario report entries.
 */
function collectTransactionRows (scenarios) {
  const rows = [];

  scenarios.forEach(function (scenario) {
    const result = scenario.result || {};

    (result.transactions || []).forEach(function (transaction) {
      rows.push(Object.assign({
        scenarioId: scenario.id,
        outcome: 'accepted'
      }, transaction));
    });

    (result.expectedFailures || []).forEach(function (transaction) {
      rows.push(Object.assign({
        scenarioId: scenario.id,
        outcome: 'expected failed'
      }, transaction));
    });
  });

  return rows;
}

/**
 * Formats one report transaction row without exposing transaction payload details.
 * @param {object} transaction - Public transaction metadata.
 */
function formatTransactionRow (transaction) {
  const label = transaction.label ? transaction.label + ': ' : '';
  const subtype = transaction.subtypeName === undefined ? '' :
    ', subtype ' + transaction.subtypeName + ' (' + transaction.subtype + ')';

  return transaction.scenarioId +
    ' - ' +
    label +
    transaction.typeName +
    ' (' +
    transaction.type +
    subtype +
    ') - ' +
    transaction.outcome;
}

/**
 * Formats one abuse report row with the reason and rejection result.
 * @param {object} check - Abuse check metadata.
 */
function formatAbuseRow (check) {
  if (check.kind === 'overload') {
    return check.scenarioId +
      ' - ' +
      check.id +
      ': ' +
      check.reason +
      ' Rejected ' +
      check.rejected +
      '/' +
      check.total +
      ', failed ' +
      check.failed +
      ', concurrency ' +
      check.concurrency +
      ', throughput ' +
      check.throughputRps +
      ' rps.';
  }

  const type = check.typeName ? ' type ' + check.typeName + ' (' + check.type + ')' : ' malformed payload';
  const subtype = check.subtype === undefined ? '' : ', subtype ' + check.subtype;
  const transactionStates = Array.isArray(check.transactions) ?
    ' Transactions: ' + check.transactions.map(function (transaction) {
      return transaction.id +
        '=' +
        transaction.state +
        ', confirmations ' +
        transaction.confirmations +
        (transaction.blockId ? ', block ' + transaction.blockId : '');
    }).join('; ') +
    '.' :
    '';

  return check.scenarioId +
    ' - ' +
    check.id +
    ':' +
    type +
    subtype +
    '. Why: ' +
    check.reason +
    ' Rejected by: ' +
    check.rejectedBy +
    '. How: ' +
    (check.howRejected || check.error || 'no details') +
    transactionStates;
}

module.exports = {
  collectAbuseRows,
  collectTransactionRows,
  formatAbuseRow,
  formatTransactionRow,
  redactSensitive,
  renderMarkdownReport,
  shouldRedactKey,
  writeReports
};
