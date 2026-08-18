import { createHash } from 'node:crypto';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const env = process.env;
const allowedScenarios = new Set([
  'terraform-drift',
  'gcp-project-loss',
  'iam-recovery',
  'database-recovery',
  'gke-recovery',
  'flux-bootstrap',
]);

function fail(message) {
  console.error(`Guardrail rejected the simulation: ${message}`);
  process.exit(1);
}

function requireMatch(value, expression, message) {
  if (!expression.test(value ?? '')) fail(message);
}

function parseNonNegativeInteger(value, field) {
  requireMatch(value, /^\d+$/, `${field} must be a non-negative integer`);
  return Number.parseInt(value, 10);
}

if (env.DR_CONFIRMATION !== 'SIMULATE') fail('confirmation must equal SIMULATE');
if (!allowedScenarios.has(env.DR_SCENARIO)) fail(`unsupported scenario: ${env.DR_SCENARIO ?? '<empty>'}`);

const phases = (env.DR_PHASES ?? '').split(',').map((phase) => phase.trim()).filter(Boolean);
if (phases.length === 0 || new Set(phases).size !== phases.length) fail('DR_PHASES must contain unique phases');

const targetRpoMinutes = parseNonNegativeInteger(env.DR_TARGET_RPO_MINUTES ?? '15', 'target RPO');
let actualRpoMinutes = null;

switch (env.DR_SCENARIO) {
  case 'gcp-project-loss':
  case 'gke-recovery':
    requireMatch(env.DR_TARGET, /^[a-z][a-z0-9-]{4,61}-dr-sandbox$/, 'target must be a valid name ending with -dr-sandbox');
    break;
  case 'database-recovery':
    requireMatch(env.DR_TARGET, /^[a-z][a-z0-9-]{2,59}-dr-restore$/, 'source overwrite forbidden: target must end with -dr-restore');
    actualRpoMinutes = parseNonNegativeInteger(env.DR_RECOVERY_POINT_AGE_MINUTES, 'recovery point age');
    if (actualRpoMinutes > targetRpoMinutes) fail('recovery point exceeds RPO');
    break;
  case 'iam-recovery':
    actualRpoMinutes = parseNonNegativeInteger(env.DR_SNAPSHOT_AGE_MINUTES, 'snapshot age');
    if (actualRpoMinutes > targetRpoMinutes) fail('snapshot exceeds RPO');
    break;
  case 'terraform-drift':
    if (!new Set(['resource-deleted', 'resource-modified', 'state-unavailable']).has(env.DR_TERRAFORM_SCENARIO)) {
      fail('unsupported Terraform scenario');
    }
    break;
  case 'flux-bootstrap':
    requireMatch(env.DR_GITOPS_PATH, /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/, 'unsafe GitOps path');
    break;
}

const startedAt = new Date();
const runId = env.GITHUB_RUN_ID ? `gh-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? '1'}` : `local-${startedAt.toISOString().replaceAll(/[:.]/g, '-')}`;
const sourceRevision = /^[a-f0-9]{40}$/i.test(env.GITHUB_SHA ?? '') ? env.GITHUB_SHA : '0000000000000000000000000000000000000000';

const phaseRuns = phases.map((phase, index) => ({
  name: phase,
  sequence: index + 1,
  result: 'PASSED',
  mockDurationMs: 180 + (index * 37),
  checks: [
    'input contract validated',
    'operation remained synthetic',
    'no external identity requested',
    'phase output recorded',
  ],
}));

const finishedAt = new Date();
const evidence = {
  schemaVersion: '1.0.0',
  run: {
    id: runId,
    mode: 'simulation',
    scenario: env.DR_SCENARIO,
    result: 'PASSED',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  },
  source: {
    repository: env.GITHUB_REPOSITORY ?? 'local/disaster-recovery-control-plane',
    revision: sourceRevision,
    workflow: env.GITHUB_WORKFLOW ?? 'local-simulation',
    actor: env.GITHUB_ACTOR ?? 'local-user',
  },
  target: env.DR_TARGET ? { reference: env.DR_TARGET, disposable: true } : null,
  objectives: {
    targetRpoMinutes,
    actualRpoMinutes,
    targetRtoMinutes: parseNonNegativeInteger(env.DR_TARGET_RTO_MINUTES ?? '60', 'target RTO'),
    mockExecutionDurationMs: phaseRuns.reduce((total, phase) => total + phase.mockDurationMs, 0),
  },
  guardrails: {
    confirmation: 'accepted',
    permissions: 'repository-read-only',
    cloudIdentityRequested: false,
    externalMutations: 0,
    immutableSource: true,
    cleanupPolicy: 'always',
  },
  phases: phaseRuns,
};

const canonicalEvidence = JSON.stringify(evidence);
evidence.integrity = {
  algorithm: 'sha256',
  contentDigest: createHash('sha256').update(canonicalEvidence).digest('hex'),
  signature: 'not-signed-mock',
};

const evidenceDirectory = resolve(env.DR_EVIDENCE_DIRECTORY ?? 'artifacts/evidence');
await mkdir(evidenceDirectory, { recursive: true });
const evidencePath = resolve(evidenceDirectory, `${env.DR_SCENARIO}.json`);
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });

const summary = [
  `## DR simulation: ${env.DR_SCENARIO}`,
  '',
  '| Gate | Result |',
  '| --- | --- |',
  '| Confirmation | PASSED |',
  '| Repository permissions | read-only |',
  '| Cloud identity | not requested |',
  '| External mutations | 0 |',
  '| RPO | ' + (actualRpoMinutes === null ? 'not applicable' : `${actualRpoMinutes}m / ${targetRpoMinutes}m`) + ' |',
  '',
  '### Phases',
  '',
  ...phaseRuns.map((phase) => `${phase.sequence}. \`${phase.name}\` — ${phase.result} (${phase.mockDurationMs} ms synthetic)`),
  '',
  `Evidence digest: \`${evidence.integrity.contentDigest}\``,
  '',
].join('\n');

if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
console.log(`Evidence written to ${evidencePath}`);
