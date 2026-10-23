/**
 * Field names the Studio reads from a look document's form. The collection
 * config and every client component that calls `useField` for them import
 * from here, so each name is stated once.
 */
export const RECIPE_FIELD = 'recipe'
/** Which effect the look is filed under: the contract its recipe is read against. */
export const EFFECT_FIELD = 'effect'
/** The look's own ground per face, a group of `dark` and `light`. */
export const GROUND_FIELD = 'ground'
/** The look's stills: inputs on the draft, outputs too once published. */
export const STILLS_FIELD = 'stills'
/** The rendered stills' media, as a relationship the poster guard and the hydration can query. Written only by Publish. */
export const STILL_MEDIA_FIELD = 'stillMedia'
/** The dark poster: the library thumbnail. */
export const THUMBNAIL_FIELD = 'thumbnail'
export const LIGHT_POSTER_FIELD = 'lightPoster'

/** Set on the one write that publishes a look with its posters in hand, so the publish guard lets it through. */
export const PUBLISH_CONTEXT = 'shaderStudioPublish'
/** Set on an internal read, so the hydration leaves slot ids alone. */
export const SKIP_HYDRATION_CONTEXT = 'shaderStudioSkipHydration'

/** The package name the admin import map resolves the Studio's components from. */
export const CLIENT_MODULE = 'shader-studio/client'
export const component = (name: string) => `${CLIENT_MODULE}#${name}`
