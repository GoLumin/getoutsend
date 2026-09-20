import type { SendEmailOptions, SendEmailResult } from "./runtime.ts";

/**
 * Dev-only stand-in for the Outsend client. Under `astro dev` the virtual
 * `virtual:getoutsend` module exports `sendEmail` from here instead of the
 * real HTTP client, so nothing ever leaves the machine. Captured messages are
 * browsable at /dev/outbox (the route is only injected in dev).
 *
 * The store hangs off `globalThis` rather than module scope so it survives
 * Vite re-evaluating this module on HMR.
 */

export interface CapturedEmail {
  id: number;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  subject: string;
  html?: string;
  text?: string;
  receivedAt: string;
}

interface Store {
  seq: number;
  messages: CapturedEmail[];
}

const STORE_KEY = "__getoutsendDevOutbox";

function store(): Store {
  const g = globalThis as unknown as Record<string, Store | undefined>;
  return (g[STORE_KEY] ??= { seq: 0, messages: [] });
}

/** Newest first. */
export function listEmails(): CapturedEmail[] {
  return [...store().messages].reverse();
}

export function getEmail(id: number): CapturedEmail | undefined {
  return store().messages.find((m) => m.id === id);
}

export function clearEmails(): void {
  store().messages.length = 0;
}

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value == null) return undefined;
  const arr = (Array.isArray(value) ? value : [value]).filter(Boolean);
  return arr.length ? arr : undefined;
}

interface DevClientConfig {
  fromName?: string;
  fromEmail?: string;
  outboxPath: string;
}

export function createDevClient(config: DevClientConfig) {
  return async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    if (!options.html && !options.text) {
      throw new Error("Either `html` or `text` body is required.");
    }

    const s = store();
    const id = ++s.seq;
    const fromEmail = options.fromEmail ?? config.fromEmail ?? "dev@localhost";
    const fromName = options.fromName ?? config.fromName ?? "";
    const message: CapturedEmail = {
      id,
      from: options.from ?? (fromName ? `${fromName} <${fromEmail}>` : fromEmail),
      to: toArray(options.to) ?? [],
      cc: toArray(options.cc),
      bcc: toArray(options.bcc),
      replyTo: toArray(options.replyTo),
      subject: options.subject,
      html: options.html,
      text: options.text,
      receivedAt: new Date().toISOString(),
    };
    s.messages.push(message);

    console.info(
      `[getoutsend:dev] captured #${id} "${message.subject}" → ${message.to.join(", ")}` +
        `  (view at ${config.outboxPath}?id=${id})`,
    );

    return { id, stream: "dev-outbox" };
  };
}
