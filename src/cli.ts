#!/usr/bin/env node
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {basename, join, relative, resolve, sep} from 'node:path';
import {parseArgs} from 'node:util';
import {gunzipSync} from 'node:zlib';

import {extractFilmstrip, frameFileName, getTraceEvents} from './filmstrip.js';

const USAGE = `Usage: filmstrip <trace.json[.gz]> [-o <dir>] [--force]

Extracts the screenshot filmstrip from a Chrome DevTools Performance trace.

Options:
  -o, --out <dir>  Output folder (default: ./<trace-name>-filmstrip/)
  -f, --force      Clear the output folder if it already has files
  -h, --help       Show this help`;

class CliError extends Error {}

function readTrace(path: string): unknown {
  let raw = readFileSync(path);
  if (raw[0] === 0x1f && raw[1] === 0x8b) {
    raw = gunzipSync(raw);
  }
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch (error) {
    if (error instanceof RangeError || (error as NodeJS.ErrnoException).code === 'ERR_STRING_TOO_LONG') {
      throw new CliError(
          `Trace too large to parse (${Math.round(raw.length / 1e6)} MB uncompressed). Try a shorter recording.`);
    }
    throw new CliError(`Could not parse ${path} as JSON: ${(error as Error).message}`);
  }
}

function traceName(path: string): string {
  return basename(path).replace(/\.gz$/i, '').replace(/\.json$/i, '');
}

function prepareOutDir(outDir: string, tracePath: string, force: boolean): void {
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    if (!force) {
      throw new CliError(`Output folder ${outDir} is not empty. Use --force to clear it.`);
    }
    // Refuse to wipe the working directory, one of its parents, or the trace itself.
    const cwd = process.cwd();
    if (cwd === outDir || cwd.startsWith(outDir + sep) || !relative(outDir, tracePath).startsWith('..')) {
      throw new CliError(`Refusing to clear ${outDir}: it contains the working directory or the trace file.`);
    }
    rmSync(outDir, {recursive: true});
  }
  mkdirSync(outDir, {recursive: true});
}

function main(): void {
  const {values, positionals} = parseArgs({
    allowPositionals: true,
    options: {
      out: {type: 'string', short: 'o'},
      force: {type: 'boolean', short: 'f', default: false},
      help: {type: 'boolean', short: 'h', default: false},
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (positionals.length !== 1) {
    throw new CliError(USAGE);
  }

  const tracePath = resolve(positionals[0]!);
  if (!existsSync(tracePath)) {
    throw new CliError(`File not found: ${positionals[0]}`);
  }

  const {frames, sources} = extractFilmstrip(getTraceEvents(readTrace(tracePath)));
  if (frames.length === 0) {
    throw new CliError(
        'No screenshots found. Re-record with the "Screenshots" checkbox enabled in the Performance panel.');
  }
  if (sources.length > 1) {
    console.warn(`Warning: frames come from ${sources.length} sources (${sources.join(', ')}); merged into one timeline.`);
  }

  const outDir = resolve(values.out ?? `${traceName(tracePath)}-filmstrip`);
  prepareOutDir(outDir, tracePath, values.force);

  frames.forEach((frame, index) => {
    writeFileSync(join(outDir, frameFileName(frame, index, frames.length)), frame.image);
  });

  const ms = (micros: number) => `${Math.round(micros / 1000).toLocaleString('en-US')}ms`;
  const displayDir = relative(process.cwd(), outDir) || '.';
  console.log(`Wrote ${frames.length} frames (${ms(frames[0]!.offsetMicros)} → ${
      ms(frames.at(-1)!.offsetMicros)}) to ${displayDir.startsWith('..') ? outDir : `./${displayDir}`}/`);
}

try {
  main();
} catch (error) {
  const isUsageError = String((error as NodeJS.ErrnoException).code).startsWith('ERR_PARSE_ARGS');
  console.error(error instanceof CliError || isUsageError ? (error as Error).message : error);
  process.exitCode = 1;
}
