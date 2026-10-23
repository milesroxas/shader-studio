# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The studio: a looks collection with a live stage, an Inspector that reads an effect's contract, stills, a ground per face, history from Payload's versions and usage.
- Publish from the admin: posters and stills render in the editor's browser and the look is published with them in one request.
- `studioLookField()`: a relationship any collection or global can hold, hydrated on read with the published look's snapshot, posters, ground and stills.
- A pluggable effect contract (`EffectContract`) with client registration (`defineStudioEffect`), and one shipped effect, `wash`.
- A guard on media documents a published look serves, and a guard on deleting a look in use.
