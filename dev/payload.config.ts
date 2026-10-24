import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { shaderStudioPlugin, studioLookField } from 'shader-studio'
import { washEffect } from 'shader-studio/effects/wash'
import sharp from 'sharp'

import { testEmailAdapter } from './helpers/testEmailAdapter.js'
import { seed } from './seed.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
    {
      slug: 'media',
      fields: [{ name: 'alt', type: 'text' }],
      upload: {
        imageSizes: [{ name: 'thumbnail', width: 300 }],
        staticDir: path.resolve(dirname, 'media'),
      },
    },
    {
      slug: 'pages',
      admin: { useAsTitle: 'title' },
      fields: [
        { name: 'title', type: 'text', required: true },
        {
          name: 'hero',
          type: 'group',
          fields: [studioLookField({ effect: 'wash', label: 'Hero', placement: 'hero' })],
        },
        {
          name: 'layout',
          type: 'blocks',
          blocks: [
            {
              slug: 'visual',
              fields: [
                { name: 'caption', type: 'text' },
                studioLookField({ effect: 'wash', label: 'Visual', placement: 'block' }),
              ],
            },
          ],
        },
      ],
      versions: { drafts: true },
    },
  ],
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URI || 'file:./dev/shader-studio.db' },
  }),
  editor: lexicalEditor(),
  email: testEmailAdapter,
  globals: [
    {
      slug: 'settings',
      fields: [
        {
          name: 'background',
          type: 'group',
          fields: [studioLookField({ effect: 'wash', label: 'Background' })],
        },
      ],
    },
  ],
  onInit: async (payload) => {
    await seed(payload)
  },
  plugins: [
    shaderStudioPlugin({
      effects: [{ client: 'shader-studio/effects/wash/client#WashEffect', contract: washEffect }],
      onPublish: ({ id, operation }) => {
        console.log(`[shader-studio] ${operation} ${id}`)
      },
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'dev-secret',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
