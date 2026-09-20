// Dev-only: serves a captured email's body for the /dev/outbox iframe.
import type { APIRoute } from "astro";
import { getEmail } from "../devOutbox.ts";

export const prerender = false;

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
}

export const GET: APIRoute = ({ params }) => {
  const message = getEmail(Number(params.id));
  if (!message) return new Response("Not found", { status: 404 });

  const body =
    message.html ??
    `<pre style="font:13px/1.5 ui-monospace,monospace;padding:16px;white-space:pre-wrap">${escapeHtml(message.text ?? "")}</pre>`;

  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
};
