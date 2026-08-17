import assert from 'node:assert/strict';

const expected = '26.6.0';
assert.equal(process.versions.node, expected, `Node.js ${expected} is required; received ${process.versions.node}`);
console.log(`Node.js runtime validated: ${process.versions.node}`);
