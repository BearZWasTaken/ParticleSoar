# Chart effect modules

Effect modules are trusted JavaScript owned by the game or song package. A chart stores only small, declarative cues; it never embeds executable code.

## Song manifest

Each difficulty may load any number of modules. Paths are relative to the song's `meta.json`.

```json
{
  "file": "hs.json",
  "difficultyLabel": "HS",
  "level": 50,
  "effectModules": [
    { "id": "environment", "file": "effects/environment.effect.js", "order": 0 },
    { "id": "planet", "file": "effects/planet.effect.js", "order": 10 }
  ]
}
```

## Chart cues

```json
{
  "fx": [
    { "time": 20, "target": "planet", "action": "enter", "params": { "radius": 30 } }
  ]
}
```

## Module contract

```js
export default {
  async preload(ctx) {
    this.texture = await ctx.resources.texture("./planet.webp");
  },

  create(ctx) {
    this.mesh = new ctx.THREE.Mesh(
      new ctx.THREE.SphereGeometry(1, 48, 32),
      new ctx.THREE.MeshBasicMaterial({ map: this.texture })
    );
    ctx.root.add(this.mesh);
  },

  update(ctx) {
    this.mesh.rotation.y = ctx.time.chartTime * 0.1;
  },

  onBeat(ctx, beat) {
    // Every crossed beat is delivered, including after a dropped frame.
  },

  onBar(ctx, bar) {
    // Called at the first beat of every bar.
  },

  actions: {
    enter(ctx, params) {
      this.mesh.scale.setScalar(params.radius ?? 1);
    }
  },

  reset(ctx) {
    // Restore deterministic initial state before editor seeking/replay.
  },

  dispose(ctx) {
    // Optional custom cleanup. Objects under ctx.root are removed automatically.
  }
};
```

The runtime exposes `ctx.scene`, `ctx.camera`, `ctx.renderer`, `ctx.composer`, `ctx.receiver.current()`, `ctx.receiver.at(time)`, URL resolution, shared resource loading, chart timing, and cleanup registration. Modules execute by `order`, then by manifest order. One module error is reported without stopping the chart or other modules.
