import type { OxfmtConfig } from 'oxfmt'

export default {
  ignorePatterns: [
    '**/payload-types.ts',
    'tsconfig.json',
    'dist',
    '.next',
    'dev/app/(payload)/admin/importMap.js',
  ],
  printWidth: 100,
  semi: false,
  singleQuote: true,
  sortPackageJson: false,
  trailingComma: 'all',
} satisfies OxfmtConfig
