'use client'

import '../../styles/studio.css'

import type { UIFieldClientComponent } from 'payload'

import { Link, useDocumentInfo } from '@payloadcms/ui'

import { useLook } from '../look-store.js'

/** Where the look is used. A look in use cannot be deleted; remove it there first. */
export const Usage: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo()
  const { loaded, uses } = useLook(id)
  const current = uses.filter((use) => !use.historical)
  if (!id || !loaded) {
    return null
  }
  return (
    <section className="flex flex-col gap-2 text-xs/5" data-shader-studio="panel">
      <h3 className="font-semibold text-xs/4 tracking-[0.02em]">Used on</h3>
      {current.length ? (
        <ul className="flex flex-col divide-y divide-border border-border border-y">
          {current.map((use) => (
            <li className="flex items-center gap-3 py-2" key={use.url}>
              <span className="w-28 shrink-0 text-muted-foreground">{use.content}</span>
              <Link className="truncate underline" href={use.url} prefetch={false}>
                {use.title}
              </Link>
              {use.draft && <span className="text-muted-foreground">in its draft</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          Nowhere yet. Choose it in a page's visual slot, or make one from there.
        </p>
      )}
    </section>
  )
}
