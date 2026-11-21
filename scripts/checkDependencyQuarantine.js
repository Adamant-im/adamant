'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOCKFILE = 'package-lock.json';
const DEFAULT_EXCEPTIONS = '.github/dependency-quarantine-exceptions.json';
const DEFAULT_NPMRC = '.npmrc';
const REGISTRY_URL = 'https://registry.npmjs.org';

function parseArguments (args) {
  const options = {};
  const allowedOptions = new Set([
    'as-of',
    'base-ref',
    'exceptions',
    'lockfile',
    'npmrc',
    'registry'
  ]);

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator === -1 ? undefined : separator);
    const value = separator === -1 ? args[++index] : argument.slice(separator + 1);

    if (!allowedOptions.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }

    if (!value) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
  }

  if (!options['base-ref']) {
    throw new Error('The --base-ref option is required');
  }

  return {
    baseRef: options['base-ref'],
    lockfile: options.lockfile || DEFAULT_LOCKFILE,
    exceptions: options.exceptions || DEFAULT_EXCEPTIONS,
    npmrc: options.npmrc || DEFAULT_NPMRC,
    asOf: options['as-of'] ? parseDate(options['as-of'], '--as-of') : Date.now(),
    registryUrl: options.registry || REGISTRY_URL
  };
}

function parseDate (value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be an ISO 8601 date`);
  }

  return parsed;
}

function parseMinimumReleaseAge (contents) {
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.replace(/\s*[;#].*$/u, '').trim();
    const match = /^min-release-age\s*=\s*(\d+)$/u.exec(line);
    if (match) {
      const days = Number(match[1]);
      if (!Number.isSafeInteger(days) || days < 1) {
        throw new Error('min-release-age must be a positive integer');
      }
      return days;
    }
  }

  throw new Error('min-release-age is missing from .npmrc');
}

function packageNameFromLockPath (lockPath) {
  const marker = 'node_modules/';
  const offset = lockPath.lastIndexOf(marker);
  if (offset === -1) {
    return null;
  }

  const segments = lockPath.slice(offset + marker.length).split('/');
  return segments[0].startsWith('@') ?
    `${segments[0]}/${segments[1]}` :
    segments[0];
}

function collectLockedVersions (lockfile) {
  const versions = new Map();

  for (const [lockPath, entry] of Object.entries(lockfile.packages || {})) {
    if (!lockPath || entry.link || typeof entry.version !== 'string') {
      continue;
    }

    const name = packageNameFromLockPath(lockPath);
    if (!name) {
      continue;
    }

    versions.set(`${name}\0${entry.version}`, {
      name,
      version: entry.version
    });
  }

  return versions;
}

function findNewLockedVersions (baseLockfile, currentLockfile) {
  const baseVersions = collectLockedVersions(baseLockfile);

  return Array.from(collectLockedVersions(currentLockfile).values())
      .filter((entry) => !baseVersions.has(`${entry.name}\0${entry.version}`))
      .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function parseExceptions (contents) {
  const exceptions = JSON.parse(contents);
  if (!Array.isArray(exceptions)) {
    throw new Error('Dependency quarantine exceptions must be an array');
  }

  const parsed = new Map();
  for (const entry of exceptions) {
    for (const field of ['package', 'version', 'reason', 'issue']) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        throw new Error(`Dependency quarantine exception is missing ${field}`);
      }
    }

    const key = `${entry.package}\0${entry.version}`;
    if (parsed.has(key)) {
      throw new Error(`Duplicate dependency quarantine exception for ${entry.package}@${entry.version}`);
    }

    parsed.set(key, entry);
  }

  return parsed;
}

async function loadPackument (name, registryUrl, fetchImpl) {
  const url = `${registryUrl.replace(/\/$/u, '')}/${encodeURIComponent(name)}`;
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'adamant-dependency-quarantine-check'
    }
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`npm registry returned ${response.status} for ${name}: ${details}`);
  }

  return response.json();
}

async function verifyReleaseAges ({
  versions,
  minimumAgeDays,
  asOf,
  exceptions,
  metadataLoader
}) {
  const cutoff = asOf - minimumAgeDays * DAY_MS;
  const grouped = new Map();
  const failures = [];
  const allowed = [];

  for (const entry of versions) {
    const packages = grouped.get(entry.name) || [];
    packages.push(entry);
    grouped.set(entry.name, packages);
  }

  const work = Array.from(grouped.values());
  let cursor = 0;
  async function worker () {
    while (cursor < work.length) {
      const packageVersions = work[cursor++];
      let metadata;

      try {
        metadata = await metadataLoader(packageVersions[0].name);
      } catch (error) {
        failures.push(`${packageVersions[0].name}: ${error.message}`);
        continue;
      }

      for (const entry of packageVersions) {
        const publishedAt = metadata.time && metadata.time[entry.version];
        if (!publishedAt) {
          failures.push(`${entry.name}@${entry.version}: missing npm publication time`);
          continue;
        }

        const published = Date.parse(publishedAt);
        if (!Number.isFinite(published)) {
          failures.push(`${entry.name}@${entry.version}: invalid npm publication time ${publishedAt}`);
          continue;
        }

        if (published > cutoff) {
          const exception = exceptions.get(`${entry.name}\0${entry.version}`);
          if (exception) {
            allowed.push({
              ...entry,
              publishedAt,
              reason: exception.reason,
              issue: exception.issue
            });
            continue;
          }

          const ageDays = (asOf - published) / DAY_MS;
          failures.push(
              `${entry.name}@${entry.version}: published ${publishedAt} (${ageDays.toFixed(2)} days old at ${new Date(asOf).toISOString()})`
          );
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(8, work.length) }, worker));

  return {
    checked: versions.length,
    failures,
    allowed
  };
}

function readJson (file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readLockfileAtRef (gitRef, lockfile) {
  const contents = execFileSync(
      'git',
      ['show', `${gitRef}:${lockfile}`],
      { cwd: process.cwd(), encoding: 'utf8' }
  );
  return JSON.parse(contents);
}

async function run () {
  const options = parseArguments(process.argv.slice(2));
  const minimumAgeDays = parseMinimumReleaseAge(
      fs.readFileSync(path.resolve(options.npmrc), 'utf8')
  );
  const baseLockfile = readLockfileAtRef(options.baseRef, options.lockfile);
  const currentLockfile = readJson(path.resolve(options.lockfile));
  const exceptions = parseExceptions(
      fs.readFileSync(path.resolve(options.exceptions), 'utf8')
  );
  const versions = findNewLockedVersions(baseLockfile, currentLockfile);
  const result = await verifyReleaseAges({
    versions,
    minimumAgeDays,
    asOf: options.asOf,
    exceptions,
    metadataLoader: (name) => loadPackument(name, options.registryUrl, fetch)
  });

  for (const exception of result.allowed) {
    console.log(
        `Allowed exception ${exception.name}@${exception.version}: ${exception.reason} (${exception.issue})`
    );
  }

  if (result.failures.length > 0) {
    for (const failure of result.failures) {
      console.error(`ERROR: ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
      `Checked ${result.checked} newly locked package versions; all satisfy the ${minimumAgeDays}-day release age policy.`
  );
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  collectLockedVersions,
  findNewLockedVersions,
  parseArguments,
  parseExceptions,
  parseMinimumReleaseAge,
  verifyReleaseAges
};
