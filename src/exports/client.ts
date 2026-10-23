// Rendering, for hosts that want exact stills of their own.
export { type CaptureInput, captureStill, captureStills } from '../client/capture.js'
// Admin components the plugin registers by import path.
export { FieldPicker } from '../client/components/FieldPicker.js'
export { History } from '../client/components/History.js'
export { Inspector } from '../client/components/Inspector.js'
export { PublishButton } from '../client/components/PublishButton.js'
export { Stage } from '../client/components/Stage.js'
export { Thumbnail } from '../client/components/Thumbnail.js'
export { Usage } from '../client/components/Usage.js'

export { type Studio, StudioProvider, useStudio } from '../client/config.js'
// What an effect registers on the client.
export {
  defineStudioEffect,
  loadScenes,
  type StudioEffectComponent,
  type StudioEffectDefinition,
  useEffectDefinitions,
} from '../client/effects.js'

export { usePrefersReducedMotion } from '../client/hooks/use-prefers-reduced-motion.js'
export { StudioPreview, useEffectScenes } from '../client/preview.js'
export {
  CAPTURE_DELTA,
  type CaptureSceneProps,
  type EffectScene,
  type LiveSceneProps,
} from '../client/scenes.js'

export type { Dependency, EffectCopy, GroupSummary, ParameterCopy } from '../core/copy.js'
