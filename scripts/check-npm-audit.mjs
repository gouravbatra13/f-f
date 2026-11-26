import { spawnSync } from 'node:child_process';

const knownUnpatchedAdvisories = new Set([
  'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
]);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['audit', '--json'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

if (result.error) {
  console.error(`Could not run npm audit: ${result.error.message}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error('npm audit did not return valid JSON.');
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const advisories = new Map();
const unresolvedPackages = new Set();
const advisoryCache = new Map();

function collectAdvisories(packageName, visiting = new Set()) {
  if (advisoryCache.has(packageName)) return advisoryCache.get(packageName);
  if (visiting.has(packageName)) return new Set();
  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability) return new Set();
  const nextVisiting = new Set(visiting).add(packageName);
  const found = new Set();

  for (const item of vulnerability.via ?? []) {
    if (typeof item === 'string') {
      for (const url of collectAdvisories(item, nextVisiting)) found.add(url);
    } else if (item && typeof item.url === 'string') {
      advisories.set(item.url, item.title ?? item.url);
      found.add(item.url);
    } else {
      unresolvedPackages.add(packageName);
    }
  }
  if (found.size === 0) unresolvedPackages.add(packageName);
  advisoryCache.set(packageName, found);
  return found;
}

for (const packageName of Object.keys(vulnerabilities)) {
  collectAdvisories(packageName);
}

if (Object.keys(vulnerabilities).length === 0 && result.status === 0) {
  console.log('npm audit: no known vulnerabilities.');
  process.exit(0);
}

const unknownAdvisories = [...advisories.keys()].filter(
  (url) => !knownUnpatchedAdvisories.has(url),
);
if (
  unknownAdvisories.length > 0 ||
  advisories.size === 0 ||
  unresolvedPackages.size > 0
) {
  console.error('npm audit found an unapproved or unclassified advisory.');
  for (const [url, title] of advisories) {
    console.error(`- ${title}: ${url}`);
  }
  for (const packageName of unresolvedPackages) {
    console.error(`- Could not classify vulnerable package: ${packageName}`);
  }
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(1);
}

console.warn(
  `npm audit warning: ${[...advisories.keys()].join(', ')} is the only ` +
    'reported advisory. It is temporarily allowlisted because the upstream ' +
    'GitHub advisory lists no patched release. See DEPLOYMENT.md; do not ' +
    'treat this as remediated.',
);
console.warn(
  `Affected dependency entries: ${Object.keys(vulnerabilities).sort().join(', ')}`,
);
