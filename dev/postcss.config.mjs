/**
 * The studio's components import `src/styles/studio.css`, a Tailwind entry the
 * package build compiles into `dist/styles/studio.css`. The dev app runs the
 * source, so Tailwind's PostCSS plugin compiles it here. A host installing the
 * published package gets the compiled file and needs none of this.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
