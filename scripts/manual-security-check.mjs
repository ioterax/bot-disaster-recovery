const suite = process.argv[2];
const supportedSuites = new Set(['mutation', 'pentest', 'owasp']);

if (!supportedSuites.has(suite)) {
  console.error('Select one manual suite: mutation, pentest or owasp.');
  process.exitCode = 2;
} else {
  console.error(
    `The ${suite} acceptance suite is reserved for a separately authorized, disposable non-production target and is not implemented yet.`,
  );
  process.exitCode = 1;
}
