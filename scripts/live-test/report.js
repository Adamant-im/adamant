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
    return scenario.suite === 'load';
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
      'Load scenarios are opt-in according to their workload. HTTP load is read-only; ' +
      'transaction load publishes real signed transactions and changes network state.'
  );

  scenarios.forEach(function (scenario) {
    const result = scenario.result || {};

    if (result.kind === 'transaction queue stress' ||
        result.kind === 'type 0 transaction queue stress') {
      appendTxQueueLoadDetails(lines, scenario);
      return;
    }

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
 * Appends a transaction queue workload summary and per-node snapshots.
 * @param {Array<string>} lines - Markdown output lines.
 * @param {object} scenario - Transaction queue scenario report entry.
 */
function appendTxQueueLoadDetails (lines, scenario) {
  const result = scenario.result || {};
  const target = result.target || {};
  const transaction = result.transaction || {};
  const workload = result.workload || {};
  const sourceAccount = result.sourceAccount || {};
  const confirmation = result.confirmation || {};
  const blockchainTps = result.blockchainTps || {};
  const confirmationNodes = (confirmation.nodes || []).filter(function (node) {
    return node.id !== target.nodeId;
  });

  lines.push('');
  lines.push('### ' + scenario.id);
  lines.push('- Scenario status: ' + scenario.status + '; duration ' + formatDuration(scenario.durationMs) + '.');
  lines.push(
      '- Test: ' +
      formatTransactionLoadAction(workload) +
      ' valid ' +
      formatReportValue(transaction.typeName) +
      ' (' +
      formatReportValue(transaction.type) +
      ') transactions to ' +
      formatReportValue(target.nodeId) +
      ' at ' +
      formatReportValue(target.apiUrl) +
      formatConfirmationTargets(confirmationNodes) +
      '.'
  );
  lines.push('- Transaction: ' + formatTxQueueTransactionDetails(transaction, sourceAccount) + '.');
  lines.push('- Workload: ' + formatTransactionLoadWorkload(workload) + '.');
  lines.push(
      '- Admission results: generated ' +
      formatReportValue(workload.generated) +
      '; accepted ' +
      formatReportValue(workload.accepted) +
      '; rejected ' +
      formatReportValue(workload.rejected) +
      '; transport failures ' +
      formatReportValue(workload.transportFailures) +
      '; HTTP failures ' +
      formatReportValue(workload.httpFailures) +
      '.'
  );
  lines.push(
      '- Rates: generated ' +
      formatReportValue(workload.generationRatePerSecond) +
      '/s; accepted ' +
      formatReportValue(workload.acceptedRatePerSecond) +
      '/s; HTTP statuses ' +
      formatStatusCodes(workload.statusCodes) +
      '.'
  );
  lines.push('- Rejection reasons: ' + formatReasonHistogram(workload.rejectionReasons) + '.');

  if (workload.mode === 'burst' &&
      Object.keys(workload.rejectionReasons || {}).some(function (reason) {
        return reason.indexOf('timestamp is more than') !== -1 &&
          reason.indexOf('in the past') !== -1;
      })) {
    lines.push(
        '- Timestamp expiration: transactions were valid when signed, but the node validates freshness ' +
        'when each request reaches balance-changing processing. Requests delayed in the balance queue ' +
        'can therefore expire before admission.'
    );
  }

  lines.push(
      '- Pool visibility: public counters ' +
      formatList(result.publicPoolCategories) +
      '; unavailable through the public count API ' +
      formatList(result.unavailablePoolCategories) +
      '.'
  );
  lines.push(
      '- Snapshot scope: pool counters are node-wide and include unrelated network traffic; ' +
      'the accepted transaction confirmation rows below are filtered to IDs from this scenario.'
  );
  lines.push(
      '- Pool stages: queued transactions passed admission and wait for application; ' +
      'unconfirmed transactions are applied to temporary account state and eligible for a block; ' +
      'multisignature transactions wait for required signatures; confirmed is the total number persisted in blocks.'
  );
  lines.push(
      '- Accepted transaction confirmation: ' +
      formatReportValue(confirmation.accepted) +
      ' accepted IDs; complete on every observation node ' +
      formatReportValue(confirmation.complete) +
      '; waited ' +
      formatDuration(confirmation.waitedMs) +
      '; timeout ' +
      formatDuration(confirmation.timeoutMs) +
      '; searched from height ' +
      formatReportValue(confirmation.fromHeight) +
      '.'
  );
  lines.push('- Confirmation outcome: ' + formatConfirmationOutcome(confirmation) + '.');

  (confirmation.nodes || []).forEach(function (node) {
    lines.push(
        '- Confirmation on ' +
        formatReportValue(node.id) +
        ': confirmed ' +
        formatReportValue(node.confirmed) +
        '/' +
        formatReportValue(node.accepted) +
        '; unconfirmed ' +
        formatReportValue(node.unconfirmed) +
        '; queued ' +
        formatReportValue(node.queued) +
        '; multisignature ' +
        formatReportValue(node.multisignature) +
        '; missing from public states ' +
        formatReportValue(node.missing) +
        '; API status ' +
        (node.ok ? 'ok' : 'failed: ' + formatReportValue(node.error)) +
        '.'
    );
  });

  if (blockchainTps.available) {
    lines.push('');
    lines.push('#### Blockchain TPS');
    lines.push('');
    lines.push(
        '- Observation: ' +
        formatReportValue(blockchainTps.nodeId) +
        '; heights ' +
        formatHeightRange(blockchainTps.firstHeight, blockchainTps.lastHeight) +
        '; blocks ' +
        formatReportValue(blockchainTps.blocks) +
        '; real block-time window ' +
        formatReportValue(blockchainTps.observedSeconds) +
        ' seconds.'
    );
    lines.push(
        '- Confirmation coverage: confirmed ' +
        formatReportValue(blockchainTps.confirmedTransactions) +
        '/' +
        formatReportValue(blockchainTps.acceptedTransactions) +
        ' accepted stress transactions (' +
        formatPercent(blockchainTps.confirmationCoveragePercent) +
        '); missing ' +
        formatReportValue(blockchainTps.missingTransactions) +
        '; complete ' +
        formatReportValue(blockchainTps.confirmationComplete) +
        '.'
    );
    lines.push(
        '- TPS: confirmed stress transactions ' +
        formatReportValue(blockchainTps.acceptedStressTps) +
        '; all blockchain transactions in the same blocks ' +
        formatReportValue(blockchainTps.blockchainTps) +
        '.'
    );
    lines.push(
        '- Block data: confirmed stress transactions ' +
        formatReportValue(
            blockchainTps.confirmedStressTransactions === undefined ?
              blockchainTps.acceptedStressTransactions :
              blockchainTps.confirmedStressTransactions
        ) +
        '; all transactions ' +
        formatReportValue(blockchainTps.blockchainTransactions) +
        '; average ' +
        formatReportValue(blockchainTps.averageTransactionsPerBlock) +
        ' transactions/block; peak ' +
        formatReportValue(blockchainTps.peakTransactionsPerBlock) +
        '/' +
        formatReportValue(blockchainTps.maxTransactionsPerBlock) +
        '; observed capacity ' +
        formatPercent(blockchainTps.observedBlockCapacityPercent) +
        '.'
    );
    lines.push(
        '- Method: TPS uses actual block timestamps and transaction counts from every block in the inclusive confirmation range; ' +
        'one slot is included for the final block. When confirmation is incomplete, stress TPS covers only accepted ' +
        'transactions still present in the final observed chain.'
    );
  } else {
    lines.push('- Blockchain TPS: unavailable; ' + formatReportValue(blockchainTps.error) + '.');
  }

  lines.push('');
  lines.push('#### Transaction Pool Snapshots');
  lines.push('');
  lines.push(
      '| Phase | Offset | Node | API status | Height | Progress | Loaded | Syncing | Consensus | Confirmed | Queued | Unconfirmed | Multisignature |'
  );
  lines.push('| --- | ---: | --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |');

  (result.snapshots || []).forEach(function (snapshot) {
    (snapshot.nodes || []).forEach(function (node) {
      const status = node.status || {};
      const transactions = node.transactions || {};

      lines.push(
          '| ' +
          formatReportValue(snapshot.phase) +
          ' | ' +
          formatDuration(snapshot.offsetMs) +
          ' | ' +
          formatReportValue(node.id) +
          ' | ' +
          (node.ok ? 'ok' : 'failed: ' + formatReportValue(node.error)) +
          ' | ' +
          formatReportValue(status.height) +
          ' | ' +
          formatTransactionProgress(node, snapshot, confirmation) +
          ' | ' +
          formatReportValue(status.loaded) +
          ' | ' +
          formatReportValue(status.syncing) +
          ' | ' +
          formatPercent(status.consensus) +
          ' | ' +
          formatReportValue(transactions.confirmed) +
          ' | ' +
          formatReportValue(transactions.queued) +
          ' | ' +
          formatReportValue(transactions.unconfirmed) +
          ' | ' +
          formatReportValue(transactions.multisignature) +
          ' |'
      );
    });
  });

  lines.push('');
  lines.push('#### Node Status Snapshots');

  (result.snapshots || []).forEach(function (snapshot) {
    (snapshot.nodes || []).forEach(function (node) {
      const status = node.status || {};

      lines.push(
          '- ' +
          formatReportValue(snapshot.phase) +
          ', ' +
          formatReportValue(node.id) +
          ': version ' +
          formatReportValue(status.version) +
          '; nethash ' +
          formatReportValue(status.nethash) +
          '; broadhash ' +
          formatReportValue(status.broadhash) +
          '; fee ' +
          formatAdmValue(status.feeAdm) +
          '; reward ' +
          formatAdmValue(status.rewardAdm) +
          '.'
      );
    });
  });
}

/**
 * Describes how a transaction load scenario creates and submits transactions.
 * @param {object} workload - Transaction workload report data.
 */
function formatTransactionLoadAction (workload) {
  if (workload.mode === 'burst') {
    return 'pre-generate, sign, retain in memory, and concurrently submit';
  }

  return 'continuously generate, sign, and submit';
}

/**
 * Formats continuous and burst transaction load parameters for Markdown reports.
 * @param {object} workload - Transaction workload report data.
 */
function formatTransactionLoadWorkload (workload) {
  if (workload.mode === 'burst') {
    return 'pre-generated ' +
      formatReportValue(workload.configuredTransactionCount) +
      ' transactions in ' +
      formatDuration(workload.generationDurationMs) +
      '; all generated before submission ' +
      formatReportValue(workload.allGeneratedBeforeSubmission) +
      '; submitted in one ' +
      formatReportValue(workload.submissionBatch) +
      ' batch with ' +
      formatReportValue(workload.concurrency) +
      ' concurrent requests; submission completed in ' +
      formatDuration(workload.submissionDurationMs) +
      '; request timeout ' +
      formatDuration(workload.requestTimeoutMs) +
      '; total workload ' +
      formatDuration(workload.actualDurationMs) +
      '; artificial delay ' +
      formatDuration(workload.artificialDelayMs);
  }

  return 'configured generation window ' +
    formatDuration(workload.configuredDurationMs) +
    '; actual ' +
    formatDuration(workload.actualDurationMs) +
    '; concurrency ' +
    formatReportValue(workload.concurrency) +
    '; artificial delay ' +
    formatDuration(workload.artificialDelayMs);
}

/**
 * Formats transaction-type-specific queue workload metadata without payload contents.
 * @param {object} transaction - Report-safe transaction metadata.
 * @param {object} sourceAccount - Report-safe source account metadata.
 */
function formatTxQueueTransactionDetails (transaction, sourceAccount) {
  const details = [
    'amount ' + formatAdmValue(transaction.amountAdm)
  ];

  if (transaction.feeMinAdm !== undefined || transaction.feeMaxAdm !== undefined) {
    details.push(
        'observed fee range ' +
        formatAdmValue(transaction.feeMinAdm).replace(/ ADM$/, '') +
        '..' +
        formatAdmValue(transaction.feeMaxAdm)
    );
  } else {
    details.push('fee ' + formatAdmValue(transaction.feeAdm));
  }

  if (transaction.subtype !== undefined) {
    details.push(
        'subtype ' +
        formatReportValue(transaction.subtypeName) +
        ' (' +
        formatReportValue(transaction.subtype) +
        ')'
    );
  }

  if (transaction.randomMessage) {
    details.push(
        'random message length ' +
        formatReportValue(transaction.configuredMessageLengthMin) +
        '..' +
        formatReportValue(transaction.configuredMessageLengthMax) +
        ' characters'
    );
    details.push(
        'observed length ' +
        formatReportValue(transaction.observedMessageLengthMin) +
        '..' +
        formatReportValue(transaction.observedMessageLengthMax) +
        ', average ' +
        formatReportValue(transaction.observedAverageMessageLength)
    );
    details.push('encoding ' + formatReportValue(transaction.messageEncoding));
    details.push('payload contents omitted from reports');
  }

  details.push(
      'unique valid recipient per transaction ' +
      formatReportValue(transaction.uniqueRecipientPerTransaction)
  );
  details.push('sender ' + formatReportValue(sourceAccount.address));

  return details.join('; ');
}

/**
 * Formats confirmed scenario transaction IDs against recipient admission count.
 * @param {object} node - Snapshot node result.
 * @param {object} snapshot - Snapshot containing the observation phase.
 * @param {object} confirmation - Final confirmation summary used for legacy report fallback.
 */
function formatTransactionProgress (node, snapshot, confirmation) {
  const progress = node.progress || {};

  if (progress.confirmed !== undefined &&
      progress.confirmed !== null &&
      progress.accepted !== undefined &&
      progress.accepted !== null) {
    return progress.confirmed + '/' + progress.accepted;
  }

  if (snapshot.phase === 'before' && confirmation.accepted !== undefined) {
    return '0/' + confirmation.accepted;
  }

  if (['after-confirmed', 'after-settled-missing', 'confirmation-timeout'].includes(snapshot.phase)) {
    const confirmationNode = (confirmation.nodes || []).find(function (candidate) {
      return candidate.id === node.id;
    });

    if (confirmationNode) {
      return confirmationNode.confirmed + '/' + confirmationNode.accepted;
    }
  }

  return 'n/a/' + formatReportValue(confirmation.accepted);
}

/**
 * Formats additional nodes used to verify block inclusion.
 * @param {Array<object>} nodes - Confirmation node summaries.
 */
function formatConfirmationTargets (nodes) {
  if (!nodes.length) {
    return '';
  }

  return ' and confirmed on ' + nodes.map(function (node) {
    return formatReportValue(node.id) + ' at ' + formatReportValue(node.apiUrl);
  }).join(', ');
}

/**
 * Formats the distinction between pending confirmation and settled missing transactions.
 * @param {object} confirmation - Public confirmation summary.
 */
function formatConfirmationOutcome (confirmation) {
  if (confirmation.outcome === 'confirmed') {
    return 'all accepted transactions are included in blocks on every observation node';
  }

  if (confirmation.outcome === 'missing-after-settlement') {
    return 'all observed public pools are empty, but ' +
      formatReportValue(confirmation.missingAfterSettlement) +
      ' accepted transactions are absent from both the final chain and public pools; ' +
      'they are not pending and may have been orphaned or dropped';
  }

  return 'confirmation timed out with up to ' +
    formatReportValue(confirmation.maxPending) +
    ' accepted transactions still visible in public pools and up to ' +
    formatReportValue(confirmation.maxMissing) +
    ' not visible in the observed chain or public pools';
}

/**
 * Formats a rejection reason histogram.
 * @param {object} reasons - Rejection reason counts.
 */
function formatReasonHistogram (reasons) {
  const labels = Object.keys(reasons || {}).sort();

  return labels.length ? labels.map(function (label) {
    return label + '=' + reasons[label];
  }).join('; ') : 'none';
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
  appendTxQueueLoadDetails,
  collectAbuseRows,
  collectForgingNodes,
  collectLoadScenarios,
  collectTransactionRows,
  formatAbuseRow,
  formatAdmValue,
  formatConfirmationOutcome,
  formatConfirmationTargets,
  formatDuration,
  formatHeightRange,
  formatList,
  formatLoadFailure,
  formatMilliseconds,
  formatObservedHeightRange,
  formatPercent,
  formatReasonHistogram,
  formatReportValue,
  formatStatusCodes,
  formatThreshold,
  formatTransactionProgress,
  formatTransactionRow,
  redactSensitive,
  renderMarkdownReport,
  shouldRedactKey,
  writeReports
};
