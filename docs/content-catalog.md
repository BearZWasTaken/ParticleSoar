# Content Catalog

`public/content/catalog.json` is a generated lightweight content graph. It is
loaded before song manifests, charts, audio, or artwork, so menus can start
without fetching every song package.

Edit `public/content/structure.json` for chapters, maps, entrypoints, and
placements. Song nodes and summaries are generated from
`public/charts/*/meta.json`. Rebuild after adding or changing songs:

```sh
node tools/build-content-catalog.mjs
```

## Nodes

Every node has a stable id and a free-form `type`. Built-in types are:

- `song`: points to a song `meta.json` through `manifest`.
- `collection`: groups other nodes without prescribing a visual layout.
- `chapter`: a progression-oriented container.
- `map`: an exploration-oriented container.

Container nodes use `entries` to reference other nodes. An entry may carry
relationship-specific data such as `order`, `position`, `unlock`, or visual
overrides. The same song can therefore appear in the library, a chapter, and an
event map without duplicating the song package.

Chapter and map nodes may also define directed `links`. Clearing the source song
unlocks the link target under the current default progression policy. Link data
belongs to the chapter rather than the song, allowing different maps to create
different routes through the same songs.

`presentation.mode` is a renderer hint, not a storage rule. Current and planned
values include `list`, `grid`, `chapter`, and `map`. Unknown values remain valid
so chart-specific experiences can add their own renderer later.

## Example map

```json
{
  "type": "map",
  "title": "Sector One",
  "presentation": { "mode": "map", "background": "sector.webp" },
  "entries": [
    {
      "target": "song:particle-arts",
      "position": [12, -4],
      "unlock": { "requires": ["story:intro"] }
    }
  ]
}
```

## Loading

Use `loadContentCatalog()` from `src/content-catalog.js`. Catalog summaries are
available immediately. Call `loadSongManifest(songId)` only after a song needs
full audio, artwork, and chart URLs. Manifest requests are cached per song.
