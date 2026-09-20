# @golumin/getoutsend

An Astro integration for [getoutsend](https://app.getoutsend.com): one
configured sender for everything a site emails, reached as `virtual:getoutsend`,
and a dev outbox so a development server never sends anything to anyone.

## Requirements

Astro 6 or newer, Node 20 or newer. Nothing else.

## Install

```sh
npm install @golumin/getoutsend
```

```js
// astro.config.mjs
import getoutsend from '@golumin/getoutsend'

integrations: [
  getoutsend({
    fromName: 'Mule Box Austin',
    fromEmail: 'hello@example.com',
  }),
]
```

```ts
import { sendEmail } from 'virtual:getoutsend'

await sendEmail({ to, subject, html })
```

## What it does

- **Nothing is sent under `astro dev`.** `sendEmail` captures to an in-memory
  outbox served at `/dev/outbox`, and those routes exist only in a dev build. No
  API key and no verified sender are needed to work on a form.
- **The key is read where the host keeps it.** Baked in at build time when the
  environment has it, and otherwise read from the host's own secret at send
  time — so a deploy from a machine with no copy of the key still produces a
  working site. Cloudflare's reader is generated at build time, because
  `cloudflare:workers` resolves nowhere else.
- **A From address and a key travel together.** A domain only sends if it is
  verified in the workspace whose key is used; a site with more than one sending
  identity passes `apiKey` per message.

## Options

| | |
|---|---|
| `fromName`, `fromEmail` | the default sender; overridable per message |
| `apiKeyEnv` | the variable holding the key. Default `GETOUTSEND_API_KEY` |
| `apiKey` | the key itself, if you would rather not use the environment |
| `baseUrl` | default `https://app.getoutsend.com` |
| `outboxPath` | where the dev outbox is served. Default `/dev/outbox` |
| `env` | a module exporting `readEnv(name)`, for a host this does not know |

## Notes

`virtual:getoutsend` is a Vite **alias** to a generated file under
`.astro/getoutsend/`, not a plugin-served virtual module. A plugin's `resolveId`
is never consulted for an import that appears inside `node_modules`, so a
package that depends on this one could not otherwise resolve it.
