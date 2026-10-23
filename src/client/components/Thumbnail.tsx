'use client'

import type { DefaultCellComponentProps } from 'payload'

import { Link, useConfig } from '@payloadcms/ui'

import { lookGround, studioGround } from '../../core/index.js'
import { useStudio } from '../config.js'
import { posterOf } from '../look-store.js'

/**
 * Poster cell for the look list. A custom Cell replaces Payload's default
 * cell wholesale, so when it lands in the first (linked) column it has to
 * render the row link itself or the row stops opening on click.
 */
export function Thumbnail({
  cellData,
  collectionSlug,
  link,
  linkURL,
  rowData,
}: DefaultCellComponentProps) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const studio = useStudio()
  const url = posterOf(cellData)
  const content = url ? (
    <img
      alt=""
      height={68}
      src={url}
      style={{
        background: studioGround(lookGround(rowData?.ground), 'dark', studio.ground),
        borderRadius: 4,
        objectFit: 'cover',
      }}
      width={120}
    />
  ) : (
    <span>Draft</span>
  )

  if (!link || !rowData?.id) {
    return content
  }

  return (
    <Link
      href={
        linkURL ??
        `${adminRoute}/collections/${collectionSlug}/${encodeURIComponent(String(rowData.id))}`
      }
      prefetch={false}
    >
      {content}
    </Link>
  )
}
