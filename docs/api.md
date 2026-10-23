# API

## Authoring over REST or the Local API

A look's draft can be created and updated like any Payload document:

```http
POST /api/studio-looks?draft=true
Content-Type: application/json

{ "title": "Hero wash", "effect": "wash", "recipe": { "version": 1, "seed": 3, "frame": 0, "deltas": {} } }
```

The `recipe` and `stills` fields carry JSON schemas listing every parameter and its range, so `payload-types.ts` and API clients know what to send. Publishing is reserved for the admin studio, where posters are rendered.

## Endpoints

The plugin adds three endpoints to the looks collection. All are gated by the plugin's `access` option.

| Method | Path           | Body                                                                                          | Description                                          |
| ------ | -------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `POST` | `/:id/publish` | multipart: `recipe` (JSON), `renders` (JSON, still id to media id), `dark`, `light` (posters) | Publish a look with its posters. Used by the studio. |
| `POST` | `/:id/stills`  | multipart: `recipe`, `still` (JSON), `image`                                                  | File one still in the media collection.              |
| `GET`  | `/:id/usage`   | none                                                                                          | Documents whose slot holds the look.                 |

## Reading a slot

With `hydrate: true` (the default), every read of a document replaces a slot's look id with the published look. Parse it on the front end with `parseRelease(contract, value)`, which returns a `Release` or `null`. See the [README](../README.md#quick-start) for an example.
