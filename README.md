# chrome-profile-filmstrip-extractor

A small CLI that extracts the screenshot filmstrip from a Chrome DevTools Performance recording and saves each frame as an image file.

## Install

Requires Node.js 22 or later.

```sh
git clone https://github.com/pedroAquino/chrome-profile-filmstrip-extractor.git
cd chrome-profile-filmstrip-extractor
npm install   # also compiles TypeScript to dist/
npm link      # puts the `filmstrip` command on your PATH
```

## Recording a trace

1. Open DevTools → **Performance**.
2. Tick the **Screenshots** checkbox.
3. Record, then click **Save profile** to export a `Trace-*.json` or `Trace-*.json.gz` file.

Traces recorded with Puppeteer or Playwright (with screenshots enabled) work too.

## Usage

```sh
filmstrip <trace.json[.gz]> [-o <dir>] [--force]
```

| Option | Description |
| --- | --- |
| `-o, --out <dir>` | Output folder. Defaults to `./<trace-name>-filmstrip/` in the current directory. Absolute or relative paths both work; missing folders are created. |
| `-f, --force` | Clear the output folder first if it already contains files. Without it, a non-empty folder is an error. |
| `-h, --help` | Show help. |

### Examples

```sh
# Frames go to ./Trace-20261021T105236-filmstrip/
filmstrip Trace-20261021T105236.json.gz

# Choose the output folder
filmstrip Trace-20261021T105236.json.gz -o ~/Desktop/frames

# Re-run into the same folder
filmstrip Trace-20261021T105236.json.gz -o ~/Desktop/frames --force

# Extract every trace in a folder
for f in *.json.gz; do filmstrip "$f"; done
```

On success it prints a single summary line:

```
Wrote 31 frames (18ms → 11,562ms) to ./Trace-20261021T105236-filmstrip/
```

## Output

Each screenshot in the trace is written as-is, with no resampling or deduplication:

```
000_+18ms.jpg
001_+1845ms.jpg
002_+1882ms.jpg
...
```

- **Index:** zero-padded, in chronological order.
- **Offset:** milliseconds since the start of the trace, matching the time ruler in the DevTools Performance panel.
- **Extension:** detected from the image bytes (Chrome normally stores JPEG).

Frames are stored at the resolution Chrome captured them at, which is usually around 500px wide. They can't be extracted any larger.

## Behaviour notes

- Accepts plain or gzipped JSON, detected from the file contents rather than the extension.
- Supports both the current screenshot event format (Chrome 2025+) and the older snapshot format.
- If screenshots come from more than one source (for example a popup), they're merged into one timeline and a warning is printed.
- `--force` refuses to clear a folder that contains your current directory or the trace file.

### Errors (exit code 1)

- **No screenshots in the trace:** re-record with the Screenshots checkbox enabled. No output folder is created.
- **Trace too large:** files above roughly 500 MB uncompressed exceed Node's maximum string size. Try a shorter recording.
- **Output folder not empty:** pass `--force` or choose another `-o`.

## Development

```sh
npm run build   # compile src/ → dist/
```

- `src/filmstrip.ts`: parses trace events into frames and file names. It has no filesystem access.
- `src/cli.ts`: argument parsing, file reading and writing, and messages.

There are no runtime dependencies.
