export interface SendEmailOptions {
  /** Recipient address(es). */
  to: string | string[];
  /** Email subject line. */
  subject: string;
  /** HTML body. At least one of `html` or `text` is required. */
  html?: string;
  /** Plain-text body. At least one of `html` or `text` is required. */
  text?: string;
  /** CC address(es). */
  cc?: string | string[];
  /** BCC address(es). */
  bcc?: string | string[];
  /** Reply-To address(es). */
  replyTo?: string | string[];
  /** Custom email headers. */
  headers?: Record<string, string>;
  /** Override the configured "From" name for this message. */
  fromName?: string;
  /** Override the configured "From" email for this message. */
  fromEmail?: string;
  /**
   * Fully-formed "From" value (e.g. `"Acme <hi@acme.com>"`). Takes precedence
   * over `fromName`/`fromEmail` and the integration defaults.
   */
  from?: string;
  /**
   * Send this one message on a different getoutsend workspace's key.
   *
   * A From address only sends if its domain is verified in the workspace whose
   * key is used, so an address and a key travel together — a site with more
   * than one sending identity needs to say which per message.
   */
  apiKey?: string;
}

/** Successful response from `POST /api/v1/emails`. */
export interface SendEmailResult {
  id: number;
  stream: string;
}

export interface ClientConfig {
  apiKey: string | undefined;
  /** Env var holding the key, for the runtime fallback below. */
  apiKeyEnv?: string;
  /**
   * How to read an environment variable on this host.
   *
   * Cloudflare holds secrets on the Worker and, since Astro 6, behind
   * `cloudflare:workers` — a specifier that resolves nowhere else, so this
   * package cannot import it and the integration writes the reader instead.
   * A deploy from a machine with no copy of the key still produces a working
   * site: the baked value wins when there is one, and the host's own secret
   * covers the build that had none.
   */
  readEnv?: (name: string) => string | undefined;
  fromName: string;
  fromEmail: string;
  baseUrl: string;
}

function fromHostEnv(config: ClientConfig): string | undefined {
  if (!config.apiKeyEnv) return undefined;
  try {
    return (
      config.readEnv?.(config.apiKeyEnv) ??
      (typeof process !== "undefined" ? process.env?.[config.apiKeyEnv] : undefined)
    );
  } catch {
    // A reader only valid on its own runtime must not take a send down with it.
    return undefined;
  }
}

export class GetoutsendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GetoutsendError";
  }
}

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value == null) return undefined;
  const arr = (Array.isArray(value) ? value : [value]).filter(Boolean);
  return arr.length ? arr : undefined;
}

function formatFrom(name: string, email: string): string {
  return name ? `${name} <${email}>` : email;
}

export function createClient(config: ClientConfig) {
  return async function sendEmail(
    options: SendEmailOptions,
  ): Promise<SendEmailResult> {
    // `||`, not `??`: an env var present but empty bakes in "", which is no
    // key at all. A per-message key wins over both — some sites send different
    // markets' mail through different workspaces.
    const apiKey = options.apiKey || config.apiKey || fromHostEnv(config);
    if (!apiKey) {
      throw new GetoutsendError(
        "Missing getoutsend API key. Set it in your environment, as a Worker secret, or pass `apiKey` to the integration.",
      );
    }
    if (!options.html && !options.text) {
      throw new GetoutsendError("Either `html` or `text` body is required.");
    }

    const from =
      options.from ??
      formatFrom(
        options.fromName ?? config.fromName,
        options.fromEmail ?? config.fromEmail,
      );

    const body = {
      from,
      to: toArray(options.to),
      subject: options.subject,
      html: options.html,
      text: options.text,
      cc: toArray(options.cc),
      bcc: toArray(options.bcc),
      replyTo: toArray(options.replyTo),
      headers: options.headers,
    };

    const res = await fetch(new URL("/api/v1/emails", config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let message = `Request failed with status ${res.status}.`;
      try {
        const errBody = (await res.json()) as { error?: string };
        if (errBody?.error) message = errBody.error;
      } catch {
        // non-JSON error response; keep the status message
      }
      throw new GetoutsendError(message, res.status);
    }

    return (await res.json()) as SendEmailResult;
  };
}
