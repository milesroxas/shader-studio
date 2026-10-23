'use client'

import { Button, toast, useDocumentInfo, useForm } from '@payloadcms/ui'
import { useState } from 'react'

import { useDraft, useGround } from '../draft.js'
import { refreshStudio, useLook } from '../look-store.js'
import { publishLook } from '../publish.js'
import { draftState } from '../status.js'

function buttonLabel(busy: null | string, saved: boolean, unchanged: boolean, places: number) {
  if (busy) {
    return busy
  }
  if (!saved) {
    return 'Create look'
  }
  if (unchanged) {
    return 'Published'
  }
  return places > 1 ? `Publish to ${places} places` : 'Publish'
}

/**
 * Publish, for a look used like a media file: the two posters and every
 * still that changed render in this browser and the look is published with
 * them in one request, so it is done when the button says so. Every place
 * that uses the look shows the result.
 */
export function PublishButton() {
  const {
    id,
    incrementVersionCount,
    setHasPublishedDoc,
    setMostRecentVersionIsAutosaved,
    setUnpublishedVersionCount,
  } = useDocumentInfo()
  const { reset, submit } = useForm()
  const { effect, effectId, recipe, stills, studio } = useDraft()
  const { ground } = useGround()
  const { live, uses } = useLook(id)
  const [busy, setBusy] = useState<null | string>(null)

  const { unchanged } = draftState(effect, recipe, ground, stills, live)
  const places = uses.filter((use) => !use.historical).length

  return (
    <Button
      disabled={busy !== null || unchanged}
      onClick={async () => {
        setBusy('Saving…')
        try {
          if (!id) {
            await submit({ overrides: { _status: 'draft' } })
            return
          }
          const doc = await publishLook(
            studio,
            submit,
            { id, effect: effectId, ground, recipe, stills },
            live,
            setBusy,
          )
          await reset(doc)
          setHasPublishedDoc(true)
          setUnpublishedVersionCount(0)
          setMostRecentVersionIsAutosaved(false)
          incrementVersionCount()
          refreshStudio()
          toast.success(
            places > 1 ? `Published. ${places} places now show this look.` : 'Published.',
          )
        } catch (error) {
          toast.error((error as Error).message)
        } finally {
          setBusy(null)
        }
      }}
    >
      {buttonLabel(busy, Boolean(id), unchanged, places)}
    </Button>
  )
}
