// Pure trace -> frames logic. No filesystem access here.
//
// Screenshot event shapes (see devtools-frontend
// front_end/models/trace/types/TraceEvents.ts):
//   modern (Chrome >= early 2025): ph "I", args.{snapshot, source_id, frame_sequence}
//   legacy:                        ph "O", id = frame sequence (hex), args.snapshot
// DevTools positions both by `ts`, so we do too.

export interface TraceEvent {
  name?: string;
  ph?: string;
  ts?: number;
  pid?: number;
  id?: string;
  args?: Record<string, unknown>;
}

export interface Frame {
  /** Microseconds since trace start (can be negative for frames before it). */
  offsetMicros: number;
  image: Buffer;
  extension: string;
  source: string;
}

export interface Filmstrip {
  frames: Frame[];
  sources: string[];
}

export function getTraceEvents(json: unknown): TraceEvent[] {
  if (Array.isArray(json)) {
    return json;
  }
  if (json && typeof json === 'object' && Array.isArray((json as {traceEvents?: unknown}).traceEvents)) {
    return (json as {traceEvents: TraceEvent[]}).traceEvents;
  }
  throw new Error('Not a Chrome trace: expected an array of events or an object with "traceEvents".');
}

const BOUNDS_PHASES = new Set(['B', 'E', 'X', 'I']);

// Mirrors DevTools MetaHandler: TracingStartedInBrowser wins, otherwise the
// earliest B/E/X/I event (ignoring ts 0 and UMA events).
export function getTraceStart(events: TraceEvent[]): number {
  let min = Infinity;
  for (const event of events) {
    if (typeof event.ts !== 'number') {
      continue;
    }
    if (event.name === 'TracingStartedInBrowser') {
      return event.ts;
    }
    if (event.ts !== 0 && !event.name?.endsWith('::UMA') && BOUNDS_PHASES.has(event.ph ?? '') && event.ts < min) {
      min = event.ts;
    }
  }
  return min;
}

function sniffExtension(image: Buffer): string {
  if (image[0] === 0x89 && image.subarray(1, 4).toString('latin1') === 'PNG') {
    return 'png';
  }
  if (image.subarray(0, 4).toString('latin1') === 'RIFF' && image.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'webp';
  }
  return 'jpg';
}

export function extractFilmstrip(events: TraceEvent[]): Filmstrip {
  const screenshots = events.filter(
      event => event.name === 'Screenshot' && typeof event.args?.snapshot === 'string' && typeof event.ts === 'number');

  let traceStart = getTraceStart(events);
  if (!Number.isFinite(traceStart)) {
    traceStart = Math.min(...screenshots.map(event => event.ts as number));
  }

  const frames = screenshots
                     .map(event => {
                       const image = Buffer.from(event.args!.snapshot as string, 'base64');
                       const sourceId = event.args!.source_id;
                       return {
                         offsetMicros: (event.ts as number) - traceStart,
                         image,
                         extension: sniffExtension(image),
                         source: sourceId !== undefined ? `source ${sourceId}` : `pid ${event.pid}`,
                       };
                     })
                     .sort((a, b) => a.offsetMicros - b.offsetMicros);

  return {frames, sources: [...new Set(frames.map(frame => frame.source))]};
}

export function frameFileName(frame: Frame, index: number, total: number): string {
  const width = Math.max(3, String(total - 1).length);
  const ms = Math.round(frame.offsetMicros / 1000);
  const offset = ms < 0 ? `-${-ms}ms` : `+${ms}ms`;
  return `${String(index).padStart(width, '0')}_${offset}.${frame.extension}`;
}
