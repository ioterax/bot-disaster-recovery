import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const expectedScenarios = [
  'gcp-project-loss',
  'iam-recovery',
  'terraform-drift',
  'database-recovery',
  'gke-recovery',
  'flux-bootstrap',
];

async function findJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findJsonFiles(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  }));
  return nested.flat();
}

const inputDirectory = resolve(process.env.DR_COMPONENT_EVIDENCE_DIRECTORY ?? 'artifacts/components');
const outputDirectory = resolve(process.env.DR_EVIDENCE_DIRECTORY ?? 'artifacts/evidence');
const files = await findJsonFiles(inputDirectory);
const components = await Promise.all(files.map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
const byScenario = new Map(components.map((component) => [component.run?.scenario, component]));

for (const scenario of expectedScenarios) {
  if (!byScenario.has(scenario)) throw new Error(`Missing evidence for ${scenario}`);
  if (byScenario.get(scenario).run.result !== 'PASSED') throw new Error(`Component ${scenario} did not pass`);
  if (byScenario.get(scenario).guardrails.externalMutations !== 0) throw new Error(`Component ${scenario} reports an external mutation`);
}

const orderedComponents = expectedScenarios.map((scenario) => byScenario.get(scenario));
const manifest = {
  schemaVersion: '1.0.0',
  scenario: 'full-project-loss',
  mode: 'simulation',
  result: 'PASSED',
  componentOrder: expectedScenarios,
  components: orderedComponents.map((component) => ({
    scenario: component.run.scenario,
    result: component.run.result,
    digest: component.integrity.contentDigest,
    phases: component.phases.map(({ name, result }) => ({ name, result })),
  })),
  controls: {
    complete: true,
    allComponentsPassed: true,
    totalExternalMutations: 0,
  },
};
manifest.integrity = {
  algorithm: 'sha256',
  contentDigest: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
  signature: 'not-signed-mock',
};

await mkdir(outputDirectory, { recursive: true });
const outputPath = join(outputDirectory, 'full-project-loss.json');
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

const summary = [
  '## Full project-loss simulation',
  '',
  '| Component | Result | Phases |',
  '| --- | --- | ---: |',
  ...manifest.components.map((component) => `| ${component.scenario} | ${component.result} | ${component.phases.length} |`),
  '',
  `Manifest digest: \`${manifest.integrity.contentDigest}\``,
  '',
  'External mutations: **0**',
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
console.log(`Aggregate evidence written to ${outputPath}`);
