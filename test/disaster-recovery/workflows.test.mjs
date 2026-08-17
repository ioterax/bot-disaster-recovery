import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowsDirectory = new URL('../../.github/workflows/', import.meta.url);

async function loadWorkflows() {
  const names = (await readdir(workflowsDirectory)).filter((name) => name.endsWith('.yml')).sort();
  return Promise.all(
    names.map(async (name) => ({ name, content: await readFile(new URL(name, workflowsDirectory), 'utf8') })),
  );
}

test('Disaster Recovery simulations cover the declared resources', async () => {
  const workflowNames = (await loadWorkflows()).map(({ name }) => name);

  for (const expected of [
    'simulate-full-recovery.yml',
    'simulate-database-recovery.yml',
    'simulate-gke-recovery.yml',
    'simulate-iam-recovery.yml',
    'simulate-terraform-drift.yml',
    'simulate-flux-bootstrap.yml',
    'disaster-recovery-simulation.yml',
  ]) {
    assert.ok(workflowNames.includes(expected), `${expected} must exist`);
  }
});

test('every simulation is manual and has no automatic trigger', async () => {
  for (const { name, content } of await loadWorkflows()) {
    assert.match(content, /^\s{2}workflow_dispatch:$/m, `${name} must expose workflow_dispatch`);
    assert.doesNotMatch(content, /^\s{2}(push|pull_request|schedule|repository_dispatch):/m, `${name} must stay manual`);
  }
});

test('every simulation is read-only, explicitly confirmed and delayed', async () => {
  for (const { name, content } of await loadWorkflows()) {
    assert.match(content, /^permissions:\n\s{2}contents: read$/m, `${name} must have read-only repository access`);
    assert.doesNotMatch(content, /id-token:\s*write/, `${name} must not request a cloud identity token`);

    if (!['disaster-recovery-simulation.yml', 'simulate-full-recovery.yml'].includes(name)) {
      assert.match(content, /confirmation must equal SIMULATE/, `${name} must fail closed without confirmation`);
      assert.match(content, /sleep 3/, `${name} must model an operation delay`);
    }
  }
});

test('orchestrators forward confirmation to fail-closed component workflows', async () => {
  const workflows = await loadWorkflows();

  for (const orchestratorName of ['disaster-recovery-simulation.yml', 'simulate-full-recovery.yml']) {
    const orchestrator = workflows.find(({ name }) => name === orchestratorName)?.content;
    assert.ok(orchestrator, `${orchestratorName} must exist`);
    assert.match(orchestrator, /confirmation: \$\{\{ inputs\.confirmation \}\}/);
  }
});

test('every executable component pins the required Node.js runtime', async () => {
  for (const { name, content } of await loadWorkflows()) {
    if (name === 'disaster-recovery-simulation.yml' || name === 'simulate-full-recovery.yml') continue;
    assert.match(content, /node-version: 26\.6\.0/, `${name} must pin Node.js 26.6.0`);
    assert.match(content, /node --run check:runtime/, `${name} must verify the runtime`);
  }
});

test('the main workflow conditionally routes every scenario', async () => {
  const workflows = await loadWorkflows();
  const main = workflows.find(({ name }) => name === 'disaster-recovery-simulation.yml')?.content;

  assert.ok(main, 'main workflow must exist');
  for (const scenario of [
    'full-project-loss',
    'gcp-project-loss',
    'terraform-drift',
    'iam-recovery',
    'database-recovery',
    'gke-recovery',
    'flux-bootstrap',
  ]) {
    assert.match(main, new RegExp(`inputs\\.scenario == '${scenario}'`));
  }
});

test('nested RPO inputs use one consistent string contract', async () => {
  const workflows = await loadWorkflows();

  for (const name of [
    'disaster-recovery-simulation.yml',
    'simulate-full-recovery.yml',
    'simulate-database-recovery.yml',
    'simulate-iam-recovery.yml',
  ]) {
    const content = workflows.find((workflow) => workflow.name === name)?.content;
    assert.ok(content, `${name} must exist`);
    assert.doesNotMatch(content, /(?:recovery_point|snapshot)_age_minutes:[^\n]*type: number/);
    assert.doesNotMatch(content, /^\s+type: number$/m);
  }
});

test('untrusted inputs are not interpolated directly into shell scripts', async () => {
  for (const { name, content } of await loadWorkflows()) {
    const lines = content.split('\n');

    for (let index = 0; index < lines.length; index += 1) {
      const runBlock = lines[index].match(/^(\s*)run: \|$/);
      if (!runBlock) continue;

      const indentation = runBlock[1].length;
      for (index += 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trim() && line.search(/\S/) <= indentation) {
          index -= 1;
          break;
        }
        assert.doesNotMatch(line, /\$\{\{\s*inputs\./, `${name} must pass inputs through env before shell use`);
      }
    }
  }
});
