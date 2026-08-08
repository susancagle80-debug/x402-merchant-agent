// x402-policy-gate.js
//
// Wraps `alchemy x402 request` with a spending policy so the agent
// can't pay an unapproved provider, exceed a per-call cap, blow past
// a daily budget, or settle on a network you didn't allow — all
// enforced BEFORE the CLI ever runs the real (non --estimate) call.
//
// Usage:
//   node x402-policy-gate.js <url>
//
// This always runs the CLI with --estimate first to see the terms,
// checks policy, and only then re-runs for real if everything passes.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, 'payment-policy.json');

function loadPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

function todaySpend(logPath) {
  if (!fs.existsSync(logPath)) return 0;
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  return lines
    .map((l) => JSON.parse(l))
    .filter((e) => e.decision === 'paid' && e.timestamp.startsWith(today))
    .reduce((sum, e) => sum + e.amountUsdc, 0);
}

function appendLog(logPath, entry) {
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    execFile('alchemy', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

// The CLI's human-readable table output is not meant for parsing.
// Use --json so this stays reliable across CLI formatting changes.
function parseEstimate(jsonOutput) {
  const data = JSON.parse(jsonOutput);
  // Defensive: adapt field names here if your installed CLI version's
  // JSON shape differs — run `alchemy x402 request <url> --estimate
  // --json` by hand once and confirm these paths before trusting them.
  return {
    provider: data.provider,
    network: data.network,
    amountUsdc: parseFloat(data.amount ?? data.amountUsdc),
    payTo: data.payTo,
  };
}

async function requestWithPolicy(url) {
  const policy = loadPolicy();

  // Step 1: always estimate first — never skip straight to a live call.
  const estimateJson = await runCli(['x402', 'request', url, '--estimate', '--json']);
  const est = parseEstimate(estimateJson);

  const providerHost = new URL(url).hostname;
  const reasons = [];

  if (!policy.allowedProviders.includes(providerHost)) {
    reasons.push(`provider "${providerHost}" not in allowlist`);
  }
  if (!policy.allowedNetworks.includes(est.network)) {
    reasons.push(`network "${est.network}" not allowed`);
  }
  if (est.amountUsdc > policy.perCallCapUsdc) {
    reasons.push(`amount ${est.amountUsdc} exceeds per-call cap ${policy.perCallCapUsdc}`);
  }
  const spentToday = todaySpend(policy.logPath);
  if (spentToday + est.amountUsdc > policy.dailyCapUsdc) {
    reasons.push(`would exceed daily cap (${spentToday} spent, cap ${policy.dailyCapUsdc})`);
  }

  const baseEntry = {
    timestamp: new Date().toISOString(),
    url,
    provider: providerHost,
    network: est.network,
    amountUsdc: est.amountUsdc,
    payTo: est.payTo,
  };

  if (reasons.length > 0) {
    appendLog(policy.logPath, { ...baseEntry, decision: 'blocked', reasons });
    throw new Error(`Payment blocked by policy:\n- ${reasons.join('\n- ')}`);
  }

  // Step 2: policy passed — run the real request.
  const liveOutput = await runCli(['x402', 'request', url, '--json']);
  appendLog(policy.logPath, { ...baseEntry, decision: 'paid' });
  return JSON.parse(liveOutput);
}

// CLI entry point
if (require.main === module) {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node x402-policy-gate.js <url>');
    process.exit(1);
  }
  requestWithPolicy(url)
    .then((result) => {
      console.log('Payment approved and completed.');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { requestWithPolicy, todaySpend };
