// Single source of truth for cross-module defaults and designer-facing tuning values.
// Runtime state and implementation-specific geometry constants stay in their owning modules.
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const CONFIG = deepFreeze({
  chart: {
    format: "ParticleSoarChart/v1",
    trajectorySampleSeconds: 0.04,
    noteTypeCodes: {
      middle: "m",
      left: "l",
      right: "r",
      space: "s",
      top: "u"
    },
    timelineDefinitions: [
      { id: "moveYaw", label: "移动方向 Yaw", color: "#70dcff", defaultValue: 90 },
      { id: "movePitch", label: "移动方向 Pitch", color: "#9af2c5", defaultValue: 0 },
      { id: "moveSpeed", label: "前进速度", color: "#ffd66b", defaultValue: 10 },
      { id: "moveStrafeSpeed", label: "横向速度", color: "#f6a6ff", defaultValue: 0 },
      { id: "cameraX", label: "相机 X", color: "#ff8fba", defaultValue: 0 },
      { id: "cameraY", label: "相机 Y", color: "#c7a8ff", defaultValue: 0 },
      { id: "cameraZ", label: "相机 Z", color: "#8aa8ff", defaultValue: 42 },
      { id: "cameraTargetX", label: "目标点 X", color: "#ffb38f", defaultValue: 0 },
      { id: "cameraTargetY", label: "目标点 Y", color: "#a8e8ff", defaultValue: 0 },
      { id: "cameraTargetZ", label: "目标点 Z", color: "#c8ff8a", defaultValue: 0 },
      { id: "cameraFov", label: "相机 FOV", color: "#f2f8fb", defaultValue: 44 }
    ],
    easingPresetGroups: [
      { label: "基础", options: [["linear", "Linear"], ["hold", "Hold"], ["midStep", "Mid Step"], ["triangle", "Triangle"], ["sinePulse", "Sine Pulse"]] },
      { label: "Quad", options: [["quadIn", "Quad In"], ["quadOut", "Quad Out"], ["quadInOut", "Quad In Out"]] },
      { label: "Cubic", options: [["cubicIn", "Cubic In"], ["cubicOut", "Cubic Out"], ["cubicInOut", "Cubic In Out"]] },
      { label: "Quart", options: [["quartIn", "Quart In"], ["quartOut", "Quart Out"], ["quartInOut", "Quart In Out"]] },
      { label: "Quint", options: [["quintIn", "Quint In"], ["quintOut", "Quint Out"], ["quintInOut", "Quint In Out"]] },
      { label: "Sine", options: [["sineIn", "Sine In"], ["sineOut", "Sine Out"], ["sineInOut", "Sine In Out"]] },
      { label: "Expo", options: [["expoIn", "Expo In"], ["expoOut", "Expo Out"], ["expoInOut", "Expo In Out"]] },
      { label: "Circ", options: [["circIn", "Circ In"], ["circOut", "Circ Out"], ["circInOut", "Circ In Out"]] },
      { label: "Elastic", options: [["elasticIn", "Elastic In"], ["elasticOut", "Elastic Out"], ["elasticInOut", "Elastic In Out"]] },
      { label: "Back", options: [["backIn", "Back In"], ["backOut", "Back Out"], ["backInOut", "Back In Out"]] },
      { label: "Bounce", options: [["bounceIn", "Bounce In"], ["bounceOut", "Bounce Out"], ["bounceInOut", "Bounce In Out"]] },
      { label: "自定义", options: [["formula", "Formula"]] }
    ],
    legacyEasingAliases: {
      easeIn: "quadIn",
      easeOut: "quadOut",
      easeInOut: "quadInOut",
      step: "hold"
    },
    defaults: {
      meta: {
        title: "Untitled Track",
        composer: "Unknown Composer",
        charter: "Unknown Charter",
        illustrator: "Unknown Illustrator",
        difficultyLabel: "HS",
        level: 1
      },
      timing: {
        duration: 30,
        offset: 0,
        subdivision: 4,
        wPosDivision: 7,
        bpm: 120,
        beatsPerBar: 4
      },
      playfield: {
        receiverRadius: 7,
        sideLaneOffset: 10.75,
        origin: [0, -10, 0]
      },
      timelines: {
        moveYaw: [[0, 90, "linear"]],
        movePitch: [[0, 0, "linear"]],
        moveSpeed: [[0, 10, "linear"]],
        moveStrafeSpeed: [[0, 0, "linear"]],
        cameraX: [[0, 0, "linear"]],
        cameraY: [[0, 0, "linear"]],
        cameraZ: [[0, 42, "linear"]],
        cameraTargetX: [[0, 0, "linear"]],
        cameraTargetY: [[0, 0, "linear"]],
        cameraTargetZ: [[0, 0, "linear"]],
        cameraFov: [[0, 44, "linear"]]
      },
      notes: []
    }
  },
  colors: {
    sceneBackground: 0x04070d,
    sceneFog: 0x050914,
    editorBackground: 0x090b0f,
    white: 0xeaf7ff,
    space: 0xffd66b,
    top: 0x9af2c5,
    left: 0x70dcff,
    right: 0xff70aa,
    speedSlow: 0x59b9d4,
    speedFast: 0xd35f91
  },
  game: {
    renderer: {
      maxPixelRatio: 1.75,
      exposure: 1.08
    },
    scene: {
      fogDensity: 0.015
    },
    camera: {
      fov: 44,
      near: 0.1,
      far: 140,
      position: [0, 0, 42],
      target: [0, 0, 0],
      swayX: 0,
      bobY: 0,
      controlsMinDistance: 2,
      controlsMaxDistance: 90,
      dampingFactor: 0.08
    },
    bloom: {
      strength: 1.78,
      radius: 0.94,
      threshold: 0.012
    },
    timing: {
      chartDuration: 8.4,
      flowSpeed: 11.75,
      staticNoteLeadSeconds: 2.15,
      postHitSeconds: 0.38,
      postHitFadeSeconds: 0.32,
      receiverMoveSeconds: 0.28
    },
    playfield: {
      noteStartY: 20,
      noteHitY: -10,
      receiverRadius: 7,
      zSpread: 0.82,
      sideLaneX: 10.75,
      specialNoteRadiusRatio: 0.5
    },
    rendering: {
      pooledConnections: 72,
      pooledLandingHints: 72,
      pooledHitParticles: 192,
      hitParticlesPerBurst: 10,
      receiverParticles: 46,
      holdParticlesPerUnit: 5,
      multiHitLineWidth: 0.0315,
      constellationLineOpacity: 0.12,
      multiHitLineOpacity: 0.34,
      middleHaloScale: 1.62,
      foregroundFogMaxFactor: 0.35,
      noteGlowIntensity: 0.2,
      noteSoftHaloOpacity: 0.2,
      receiverGlowOpacity: 0.5,
      receiverGlowIntensity: 1.2,
      receiverParticleMaterialOpacity: 0.32,
      receiverParticleBaseOpacity: 0.28,
      hitGlowIntensity: 1.2,
      hitParticleBaseOpacity: 0.45,
      hitParticleOpacityRange: 0.18
    },
    background: {
      cellSize: 12,
      loadRadius: 96,
      pointsPerCell: 15,
      pointChance: 0.88,
      trianglesPerCell: 2,
      triangleChance: 0.52,
      maxPoints: 65000,
      maxTriangles: 5000,
      pointOpacity: 0.3,
      triangleOpacity: 0.21,
      nearFadeStart: 16,
      nearFadeEnd: 24,
      playfieldClearDepthFeather: 2
    },
    sideRails: {
      pointCount: 32,
      maxOpacity: 0.5,
      minPulse: 0.25,
      pulseSpeed: 3.4
    },
    editorPreview: {
      routeMinSampleSeconds: 0.035,
      routeMaxSegments: 6000,
      centerRouteWidth: 2.4,
      centerRouteOpacity: 0.46,
      sideRouteWidth: 1.4,
      sideRouteOpacity: 0.52,
      initialDistance: 62,
      receiverDistanceScale: 9,
      minOrbitDistanceScale: 1.25,
      minimumMaxDistance: 100,
      preservedDistanceMaxScale: 1.25,
      fullRouteFitMargin: 1.3,
      farPlaneDistanceScale: 3
    },
    judgement: {
      mode: "ordinary",
      inputOffsetSeconds: 0,
      windows: {
        ordinary: { flawless: 0.040, prime: 0.075, decent: 0.150, loose: 0.170 },
        challenging: { flawless: 0.025, prime: 0.040, decent: 0.080, loose: 0.100 },
        impossible: { flawless: 0.013, prime: 0.020, decent: 0.040, loose: 0.050 }
      }
    },
    scoring: {
      flawlessPool: 952000,
      primePool: 950000,
      decentRatio: 0.32,
      comboPool: 50000,
      maxComboPunishment: 20
    },
    ui: {
      scoreDigits: 7
    },
    input: {
      left: ["Backquote", "Tab", "CapsLock", "ShiftLeft", "Digit1", "Digit2", "Digit3", "KeyQ", "KeyW", "KeyE", "KeyA", "KeyS", "KeyZ", "KeyX"],
      right: ["KeyP", "BracketLeft", "BracketRight", "Backslash", "Semicolon", "Quote", "Enter", "Period", "Slash", "ShiftRight", "Minus", "Equal", "Backspace"],
      middle: ["KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma"],
      top: ["Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"],
      space: ["Space"]
    }
  },
  editor: {
    initialPixelsPerSecond: 72,
    trajectorySampleSeconds: 0.035,
    zoom: { min: 36, max: 480, step: 1 },
    noteLayout: {
      left: 0.07,
      middleStart: 0.16,
      middleEnd: 0.58,
      right: 0.68,
      space: 0.82,
      top: 0.94
    },
    noteTypeLabels: {
      middle: "中间",
      left: "左",
      right: "右",
      space: "空格",
      top: "上"
    },
    previewTiming: {
      leadSeconds: 2.15,
      postHitSeconds: 0.38
    },
    waveform: {
      width: 88,
      maxRenderHeight: 16000,
      maxPixelRatio: 1.5,
      colorSteps: 28,
      pitchFftSize: 2048,
      samplesPerSecond: 96,
      maxPeakBins: 65536,
      minPeakBins: 2048
    },
    timelineCurve: {
      pixelsPerSample: 4,
      maxSamples: 1400
    },
    renderer: {
      maxPixelRatio: 1.75,
      exposure: 1.35
    },
    camera: {
      fov: 44,
      near: 0.1,
      far: 20000,
      initialPosition: [40, 40, 60],
      dampingFactor: 0.08,
      freeViewFov: 48,
      freeViewMinimumDistance: 48,
      freeViewReceiverDistanceScale: 7,
      freeViewMinOrbitDistance: 10,
      freeViewMinOrbitScale: 2.2,
      freeViewMaxOrbitDistance: 180,
      freeViewMaxOrbitScale: 30
    }
  }
});
