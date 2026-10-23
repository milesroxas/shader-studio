'use client'

import { defineStudioEffect } from '../../client/effects.js'
import { washCopy, washEffect } from './index.js'

/**
 * The wash, registered with the admin. Pass this module's path as the
 * effect's `client` in the plugin options:
 * `{ contract: washEffect, client: 'shader-studio/effects/wash/client#WashEffect' }`.
 * The scenes import Three, so they load when a Studio first draws.
 */
export const WashEffect = defineStudioEffect({
  contract: washEffect,
  copy: washCopy,
  scenes: () => import('./scenes.js'),
})
