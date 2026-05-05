/**
 * Lightweight PII redaction for structured log entries.
 */

export interface RedactConfig {
  enabled: boolean;
  patterns: Array<{ regex: RegExp; replacement: string }>;
}

type Pat = { regex: RegExp; replacement: string };

function rs(v: string, p: Pat[]): string {
  for (const { regex, replacement } of p) {
    regex.lastIndex = 0;
    v = v.replace(regex, replacement);
  }
  return v;
}

export function redactObject(o: Record<string, unknown>, p: Pat[]): Record<string, unknown> {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === "string") {
      o[k] = rs(v, p);
    } else if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (typeof v[i] === "string") v[i] = rs(v[i] as string, p);
        else if (v[i] !== null && typeof v[i] === "object") redactObject(v[i] as Record<string, unknown>, p);
      }
    } else if (v !== null && typeof v === "object") {
      redactObject(v as Record<string, unknown>, p);
    }
  }
  return o;
}
