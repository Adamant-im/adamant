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

  const forgingNodes = collectForgingNodes(report.scenarios);

  if (forgingNodes.length) {
    appendForgingDetails(lines, forgingNodes);
  }

  const loadScenarios = collectLoadScenarios(report.scenarios);

  if (loadScenarios.length) {
    appendLoadDetails(lines, loadScenarios);
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
 * Collects load scenario entries that contain detailed result payloads.
 * @param {Array<object>} scenarios - Scenario report entries.
 */
function collectLoadScenarios (scenarios) {
  return scenarios.filter(function (scenario) {
    return scenario.suite === 'load' || scenario.id === 'load.http' || scenario.id === 'load.stress';
  });
}

/**
 * Appends exact workload, acceptance criteria, and observed load results.
 * @param {Array<string>} lines - Markdown output lines.
 * @param {Array<object>} scenarios - Load scenario report entries.
 */
function appendLoadDetails (lines, scenarios) {
  lines.push('');
  lines.push('## Load Details');
  lines.push('');
  lines.push(
      'These scenarios send bounded read-only requests to one target node. ' +
      'They do not submit transactions, forge blocks, or define latency/throughput pass thresholds.'
  );

  scenarios.forEach(function (scenario) {
    const result = scenario.result || {};
    const target = result.target || {};
    const request = result.request || {};
    const profile = result.profile || {};
    const acceptance = result.acceptance || {};
    const observed = result.results || {};
    const nodeState = observed.observedNodeState || {};
    const latency = observed.latencyMs || {};

    lines.push('');
    lines.push('### ' + scenario.id);
    lines.push('- Scenario status: ' + scenario.status + '; duration ' + formatDuration(scenario.durationMs) + '.');
    lines.push(
        '- Test: ' +
        formatReportValue(result.kind) +
        ' against ' +
        formatReportValue(target.nodeId) +
        ' at ' +
        formatReportValue(target.apiUrl) +
        '.'
    );
    lines.push(
        '- Request: ' +
        formatReportValue(request.method) +
        ' ' +
        formatReportValue(request.path) +
        '; request body ' +
        (request.body === null ? 'none' : formatReportValue(request.body)) +
        '.'
    );
    lines.push(
        '- Profile: requested ' +
        formatReportValue(profile.requestedName) +
        '; applied ' +
        formatReportValue(profile.appliedName) +
        '; requests ' +
        formatReportValue(profile.requests) +
        '; concurrency ' +
        formatReportValue(profile.concurrency) +
        '.'
    );
    lines.push('- Pass condition: ' + formatReportValue(acceptance.requirement));
    lines.push(
        '- Performance thresholds: latency ' +
        formatThreshold(acceptance.latencyThresholdMs, 'ms') +
        '; throughput ' +
        formatThreshold(acceptance.throughputThresholdRps, 'rps') +
        '. Measurements are informational.'
    );
    lines.push(
        '- Result: ' +
        formatReportValue(observed.completed) +
        '/' +
        formatReportValue(observed.totalRequests) +
        ' successful; ' +
        formatReportValue(observed.failed) +
        ' failed; passed ' +
        formatReportValue(result.passed) +
        '.'
    );
    lines.push(
        '- Failure classes: transport ' +
        formatReportValue(observed.transportFailures) +
        '; HTTP ' +
        formatReportValue(observed.httpFailures) +
        '; API payload ' +
        formatReportValue(observed.apiFailures) +
        '.'
    );
    lines.push('- HTTP status codes: ' + formatStatusCodes(observed.statusCodes) + '.');
    lines.push(
        '- Timing: elapsed ' +
        formatDuration(observed.elapsedMs) +
        '; successful throughput ' +
        formatReportValue(observed.throughputRps) +
        ' requests/second.'
    );
    lines.push(
        '- Latency: min ' +
        formatMilliseconds(latency.min) +
        '; average ' +
        formatMilliseconds(latency.avg) +
        '; p95 ' +
        formatMilliseconds(latency.p95) +
        '; max ' +
        formatMilliseconds(latency.max) +
        '; samples ' +
        formatReportValue(latency.count) +
        '.'
    );
    lines.push(
        '- Observed node state: height ' +
        formatObservedHeightRange(nodeState.minHeight, nodeState.maxHeight) +
        '; nethashes ' +
        formatList(nodeState.nethashes) +
        '; versions ' +
        formatList(nodeState.versions) +
        '; distinct broadhashes ' +
        formatReportValue(nodeState.broadhashChanges) +
        '.'
    );

    if (Array.isArray(observed.failureExamples) && observed.failureExamples.length) {
      lines.push('- Failure examples: ' + observed.failureExamples.map(formatLoadFailure).join('; ') + '.');
    }
  });
}

/**
 * Formats a nullable performance threshold.
 * @param {?number} value - Threshold value.
 * @param {string} unit - Display unit.
 */
function formatThreshold (value, unit) {
  return value === undefined || value === null ? 'not configured' : value + ' ' + unit;
}

/**
 * Formats an elapsed duration in milliseconds.
 * @param {?number} value - Duration in milliseconds.
 */
function formatDuration (value) {
  return value === undefined || value === null ? 'n/a' : value + ' ms';
}

/**
 * Formats a latency value in milliseconds.
 * @param {?number} value - Latency in milliseconds.
 */
function formatMilliseconds (value) {
  return value === undefined || value === null ? 'n/a' : value + ' ms';
}

/**
 * Formats minimum and maximum heights observed in load responses.
 * @param {?number} minHeight - Minimum observed height.
 * @param {?number} maxHeight - Maximum observed height.
 */
function formatObservedHeightRange (minHeight, maxHeight) {
  if (minHeight === undefined || minHeight === null || maxHeight === undefined || maxHeight === null) {
    return 'n/a';
  }

  return minHeight === maxHeight ? String(minHeight) : minHeight + '..' + maxHeight;
}

/**
 * Formats an HTTP status code histogram.
 * @param {object} statusCodes - Status code counts.
 */
function formatStatusCodes (statusCodes) {
  const codes = Object.keys(statusCodes || {}).sort(function (left, right) {
    return Number(left) - Number(right);
  });

  return codes.length ? codes.map(function (code) {
    return code + '=' + statusCodes[code];
  }).join(', ') : 'none';
}

/**
 * Formats one captured load failure without dumping response payloads.
 * @param {object} failure - Captured failure metadata.
 */
function formatLoadFailure (failure) {
  return 'status ' +
    formatReportValue(failure.status) +
    ', transport ' +
    formatReportValue(failure.transportError) +
    ', API ' +
    formatReportValue(failure.apiError) +
    ', success ' +
    formatReportValue(failure.success);
}

/**
 * Collects per-node forging observations from forging scenario results.
 * @param {Array<object>} scenarios - Scenario report entries.
 */
function collectForgingNodes (scenarios) {
  const forgingScenario = scenarios.find(function (scenario) {
    return scenario.id === 'delegates.forging';
  });

  return forgingScenario && forgingScenario.result && Array.isArray(forgingScenario.result.nodes) ?
    forgingScenario.result.nodes :
    [];
}

/**
 * Appends detailed per-node forging, consensus, and reward observations.
 * @param {Array<string>} lines - Markdown output lines.
 * @param {Array<object>} nodes - Per-node forging scenario results.
 */
function appendForgingDetails (lines, nodes) {
  lines.push('');
  lines.push('## Forging Details');

  nodes.forEach(function (node) {
    const forging = node.forging || {};
    const delegates = node.delegates || {};
    const nextForgers = node.nextForgers || {};
    const network = node.network || {};
    const consensus = node.consensus || {};
    const rewardStage = node.rewardStage || {};
    const latestBlock = node.latestBlock || {};
    const generatorForged = node.latestGeneratorForged || {};
    const switchSummary = (consensus.switches || []).map(function (item) {
      return item.name +
        '=' +
        item.state +
        ' (activation ' +
        item.activationHeight +
        ', distance ' +
        item.distance +
        ')';
    }).join('; ') || 'none reported';

    lines.push('');
    lines.push('### ' + node.id);
    lines.push('- API: ' + node.apiUrl);
    lines.push(
        '- Forging status: ' +
        (forging.enabled ? 'enabled' : 'disabled') +
        '; configured fixture passphrases ' +
        formatReportValue(node.delegateSecretsCount) +
        '; configured public keys ' +
        formatReportValue(forging.configuredDelegateCount) +
        '.'
    );
    lines.push(
        '- Delegate API: returned ' +
        formatReportValue(delegates.returnedCount) +
        ' of ' +
        formatReportValue(delegates.totalCount) +
        ' delegates.'
    );
    lines.push(
        '- Chain: height ' +
        formatReportValue(network.height) +
        '; nethash ' +
        formatReportValue(network.nethash) +
        '; broadhash ' +
        formatReportValue(network.broadhash) +
        '.'
    );
    lines.push(
        '- Consensus: live ' +
        formatPercent(consensus.livePercent) +
        ' (' +
        formatReportValue(consensus.matchingPeers) +
        '/' +
        formatReportValue(consensus.connectedPeers) +
        ' connected peers match); cached ' +
        formatPercent(consensus.cachedPercent) +
        '; switches ' +
        switchSummary +
        '.'
    );
    lines.push(
        '- Reward stage: ' +
        formatReportValue(rewardStage.name) +
        '; active ' +
        formatReportValue(rewardStage.active) +
        '; protocol milestone ' +
        formatReportValue(rewardStage.protocolMilestone) +
        '; height range ' +
        formatHeightRange(rewardStage.startHeight, rewardStage.endHeight) +
        '; current reward ' +
        formatReportValue(rewardStage.currentRewardAdm) +
        ' ADM; supply ' +
        formatReportValue(rewardStage.supplyAdm) +
        ' ADM.'
    );
    lines.push(
        '- Next reward stage: height ' +
        formatReportValue(rewardStage.nextStageHeight) +
        '; reward ' +
        formatAdmValue(rewardStage.nextRewardAdm) +
        '.'
    );
    lines.push(
        '- Latest block: height ' +
        formatReportValue(latestBlock.height) +
        '; id ' +
        formatReportValue(latestBlock.id) +
        '; generator ' +
        formatReportValue(latestBlock.generatorPublicKey) +
        ' (' +
        formatReportValue(latestBlock.generatorId) +
        '); configured on ' +
        formatList(latestBlock.generatorNodeIds) +
        '; confirmations ' +
        formatReportValue(latestBlock.confirmations) +
        '.'
    );
    lines.push(
        '- Latest block rewards: reward ' +
        formatAdmValue(latestBlock.rewardAdm) +
        '; fees ' +
        formatAdmValue(latestBlock.totalFeeAdm) +
        '; total forged ' +
        formatAdmValue(latestBlock.totalForgedAdm) +
        '.'
    );
    lines.push(
        '- Latest generator totals: rewards ' +
        formatAdmValue(generatorForged.rewardsAdm) +
        '; fees ' +
        formatAdmValue(generatorForged.feesAdm) +
        '; forged ' +
        formatAdmValue(generatorForged.forgedAdm) +
        '.'
    );
    lines.push(
        '- Next forgers: current block ' +
        formatReportValue(nextForgers.currentBlock) +
        '; block slot ' +
        formatReportValue(nextForgers.currentBlockSlot) +
        '; current slot ' +
        formatReportValue(nextForgers.currentSlot) +
        '; public keys ' +
        formatList(nextForgers.publicKeys) +
        '.'
    );
    lines.push('- Configured forging public keys: ' + formatList(forging.configuredDelegatePublicKeys) + '.');
  });
}

/**
 * Formats a nullable report value without hiding zero or false.
 * @param {*} value - Report value.
 */
function formatReportValue (value) {
  return value === undefined || value === null ? 'n/a' : String(value);
}

/**
 * Formats a nullable percentage.
 * @param {?number} value - Percentage value.
 */
function formatPercent (value) {
  return value === undefined || value === null ? 'n/a' : value + '%';
}

/**
 * Formats a nullable ADM amount.
 * @param {?string} value - ADM amount.
 */
function formatAdmValue (value) {
  return value === undefined || value === null ? 'n/a' : value + ' ADM';
}

/**
 * Formats an inclusive reward-stage height range.
 * @param {?number} startHeight - First stage height.
 * @param {?number} endHeight - Last stage height, or null for no upper bound.
 */
function formatHeightRange (startHeight, endHeight) {
  return formatReportValue(startHeight) + '..' + (endHeight === null ? 'unbounded' : formatReportValue(endHeight));
}

/**
 * Formats a list while preserving every observed value.
 * @param {Array<*>} values - Values to join.
 */
function formatList (values) {
  return Array.isArray(values) && values.length ? values.join(', ') : 'none';
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
  appendForgingDetails,
  appendLoadDetails,
  collectAbuseRows,
  collectForgingNodes,
  collectLoadScenarios,
  collectTransactionRows,
  formatAbuseRow,
  formatAdmValue,
  formatDuration,
  formatHeightRange,
  formatList,
  formatLoadFailure,
  formatMilliseconds,
  formatObservedHeightRange,
  formatPercent,
  formatReportValue,
  formatStatusCodes,
  formatThreshold,
  formatTransactionRow,
  redactSensitive,
  renderMarkdownReport,
  shouldRedactKey,
  writeReports
};
