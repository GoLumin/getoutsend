// One configured sender for a site's outgoing email, and a dev outbox so a
// development server never sends anything.
//
// The client is reached as `virtual:getoutsend`, but that specifier is a Vite
// alias to a real generated file rather than a plugin-served virtual module: a
// plugin's resolveId is never consulted for an import that appears inside
// node_modules, so a package that depends on this one could not resolve it.

import type { AstroIntegration } from 'astro'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadEnv } from 'vite'
import { adapterKind, envModule } from './generated.ts'

export interface GetoutsendOptions {
  /**
   * Default "From" name on outgoing email. Overridable per message via
   * `sendEmail({ fromName })`.
   */
  fromName: string
  /**
   * Default "From" address. Its domain must be a verified sending domain in the
   * getoutsend workspace whose key sends it, or the message is rejected
   * outright and the recipient hears nothing.
   */
  fromEmail: string
  /** The key itself. Usually left unset so it is read from the environment. */
  apiKey?: string
  /** The variable holding the key. @default "GETOUTSEND_API_KEY" */
  apiKeyEnv?: string
  /** @default "https://app.getoutsend.com" */
  baseUrl?: string
  /** Where the dev outbox is served. @default "/dev/outbox" */
  outboxPath?: string
  /**
   * A module exporting `readEnv(name)`, for a host this integration does not
   * already know how to read. Rarely needed — Cloudflare and Node are handled.
   */
  env?: string
}

const NAME = '@golumin/getoutsend'

const TYPES = `declare module 'virtual:getoutsend' {
  export * from '@golumin/getoutsend/client'
  import type { SendEmailOptions, SendEmailResult } from '@golumin/getoutsend/client'
  export const sendEmail: (options: SendEmailOptions) => Promise<SendEmailResult>
}
`

export default function getoutsend(options: GetoutsendOptions): AstroIntegration {
  const {
    fromName,
    fromEmail,
    baseUrl = 'https://app.getoutsend.com',
    apiKeyEnv = 'GETOUTSEND_API_KEY',
    outboxPath = '/dev/outbox',
  } = options

  return {
    name: NAME,
    hooks: {
      'astro:config:setup': ({ command, config, updateConfig, injectRoute, logger }) => {
        const isDev = command === 'dev'
        const root = fileURLToPath(config.root)

        // Under `astro dev` nothing is ever sent: sendEmail captures to an
        // in-memory outbox. The routes are injected only here, so they do not
        // exist in a production build.
        if (isDev) {
          injectRoute({
            pattern: outboxPath,
            entrypoint: `${NAME}/pages/outbox.astro`,
            prerender: false,
          })
          injectRoute({
            pattern: `${outboxPath}/[id]`,
            entrypoint: `${NAME}/pages/message.ts`,
            prerender: false,
          })
          logger.info(`dev mode — emails are captured to ${outboxPath}, nothing is sent`)
        }

        // Resolved against the project root, not the working directory: an
        // `astro dev --root <dir>`, or a script run from a parent folder, would
        // otherwise read a .env belonging to something else. `config.root` is a
        // URL, so it has to be converted rather than passed through.
        //
        // The empty prefix is what makes this see the whole environment, shell
        // exports included: Vite folds every matching process.env key in, and
        // every key matches "".
        const env = loadEnv(isDev ? 'development' : 'production', root, '')
        const apiKey = options.apiKey ?? env[apiKeyEnv]

        if (!isDev && (!fromEmail || !fromName)) {
          logger.warn('`fromName` and `fromEmail` should both be set.')
        }
        if (!isDev && !apiKey) {
          logger.warn(
            `no API key baked in — set \`${apiKeyEnv}\` in the environment or pass \`apiKey\`. ` +
              `A deployed host falls back to its own \`${apiKeyEnv}\` secret; without either, emails fail to send.`
          )
        }

        const generatedDir = path.join(root, '.astro', 'getoutsend')
        mkdirSync(generatedDir, { recursive: true })
        const emit = (name: string, contents: string): string => {
          const file = path.join(generatedDir, `${name}.mjs`)
          const next = `${contents.trim()}\n`
          try {
            // Only written when it differs, so a watching dev server is not
            // restarted by a build that changed nothing.
            if (readFileSync(file, 'utf8') === next) return file
          } catch {
            // Not written yet.
          }
          writeFileSync(file, next)
          return file
        }

        const envFile = emit(
          'env',
          options.env
            ? `export { readEnv } from ${JSON.stringify(path.resolve(root, options.env))}`
            : envModule(adapterKind(config.adapter?.name))
        )

        const client = isDev
          ? [
              `import { createDevClient } from '@golumin/getoutsend/dev-client'`,
              `export const sendEmail = createDevClient(${JSON.stringify({
                fromName,
                fromEmail,
                outboxPath,
              })})`,
            ].join('\n')
          : [
              `import { createClient } from '@golumin/getoutsend/client'`,
              `import { readEnv } from ${JSON.stringify(envFile)}`,
              `export const sendEmail = createClient({`,
              `  ...${JSON.stringify({ apiKey, apiKeyEnv, fromName, fromEmail, baseUrl })},`,
              `  readEnv,`,
              `})`,
            ].join('\n')

        updateConfig({
          vite: {
            ssr: { noExternal: [NAME] },
            // Nothing here needs pre-bundling, and letting the optimiser walk
            // in would send it on into the site's own modules.
            optimizeDeps: { exclude: [NAME] },
            resolve: {
              // Anchored, in array form: a string alias matches by prefix, and
              // arrays concatenate when several integrations add their own.
              alias: [{ find: /^virtual:getoutsend$/, replacement: emit('client', client) }],
            },
          },
        })
      },

      // Declared by the integration rather than shipped as a .d.ts each
      // consumer has to remember to include.
      'astro:config:done': ({ injectTypes }) => {
        injectTypes({ filename: 'getoutsend.d.ts', content: TYPES })
      },
    },
  }
}

export type { SendEmailOptions, SendEmailResult } from './runtime.ts'
