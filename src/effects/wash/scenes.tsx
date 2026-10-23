'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'

import type { CaptureSceneProps, LiveSceneProps } from '../../client/scenes.js'
import type { Tuning } from '../../core/effect.js'
import type { WashTuning } from './index.js'

/**
 * The scenes that draw a wash: one full-screen quad and one fragment shader.
 * `Capture` is mounted by the Studio inside its own offscreen canvas and
 * stepped a fixed 1/60 s per frame; `Live` owns a canvas filling the stage.
 * Both draw through `WashPlane`, so a still is the live look at that moment.
 */

const MAX_OCTAVES = 6

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAGMENT = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uSeed;
uniform float uScale;
uniform int uOctaves;
uniform float uWarp;
uniform float uWarpScale;
uniform float uSpeed;
uniform vec2 uDrift;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uContrast;
uniform float uGrain;
uniform float uVignette;
uniform float uOpacity;
uniform vec2 uResolution;

varying vec2 vUv;

const int MAX_OCTAVES = ${MAX_OCTAVES};

// A hash on the integer lattice, offset by the seed so every seed is another field.
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p + uSeed * 0.0137) * 43758.5453123);
}

// A scalar hash for grain: pixel and moment in, noise out.
float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Gradient noise on a quintic fade: smooth, isotropic, in -1..1.
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal Brownian motion with as many layers as the placement allows.
float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  float weight = 0.0;
  for (int i = 0; i < MAX_OCTAVES; i++) {
    if (i >= uOctaves) break;
    sum += amplitude * gnoise(p);
    weight += amplitude;
    p = p * 2.02 + vec2(17.3, 9.1);
    amplitude *= 0.5;
  }
  return sum / max(weight, 0.0001);
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) * uScale;
  float t = uTime * uSpeed;
  p += uDrift * t;

  // Domain warp: the field folds into itself by a second, slower field.
  vec2 q = vec2(
    fbm(p * uWarpScale + vec2(0.0, t * 0.25)),
    fbm(p * uWarpScale + vec2(5.2, 1.3) - vec2(t * 0.2, 0.0))
  );
  float field = fbm(p + uWarp * 2.0 * q + vec2(t * 0.1));
  float v = clamp(field * 0.5 + 0.5, 0.0, 1.0);

  // Contrast around the middle, then the three-stop gradient.
  v = clamp((v - 0.5) * uContrast + 0.5, 0.0, 1.0);
  vec3 rgb = v < 0.5
    ? mix(uColorA, uColorB, smoothstep(0.0, 0.5, v))
    : mix(uColorB, uColorC, smoothstep(0.5, 1.0, v));

  // Film grain: a hash of the pixel and the moment, centred on zero.
  float grain = (hash1(gl_FragCoord.xy + fract(uTime) * 61.7) - 0.5) * uGrain;
  rgb += grain;

  // Vignette: darkens the corners by the distance from the centre.
  vec2 centred = (vUv - 0.5) * vec2(aspect, 1.0);
  float falloff = 1.0 - uVignette * smoothstep(0.35, 1.1, length(centred));
  rgb *= max(falloff, 0.0);

  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), uOpacity);
}
`

type WashUniforms = {
  uColorA: { value: [number, number, number] }
  uColorB: { value: [number, number, number] }
  uColorC: { value: [number, number, number] }
  uContrast: { value: number }
  uDrift: { value: [number, number] }
  uGrain: { value: number }
  uOctaves: { value: number }
  uOpacity: { value: number }
  uResolution: { value: [number, number] }
  uScale: { value: number }
  uSeed: { value: number }
  uSpeed: { value: number }
  uTime: { value: number }
  uVignette: { value: number }
  uWarp: { value: number }
  uWarpScale: { value: number }
}

const asWash = (tuning: Tuning): WashTuning => tuning as WashTuning

const uniformsOf = (tuning: WashTuning): WashUniforms => ({
  uColorA: { value: [...tuning.colorA] },
  uColorB: { value: [...tuning.colorB] },
  uColorC: { value: [...tuning.colorC] },
  uContrast: { value: tuning.contrast },
  uDrift: { value: [...tuning.drift] },
  uGrain: { value: tuning.grain },
  uOctaves: { value: Math.max(1, Math.min(MAX_OCTAVES, Math.round(tuning.octaves))) },
  uOpacity: { value: tuning.opacity },
  uResolution: { value: [1, 1] },
  uScale: { value: tuning.scale },
  uSeed: { value: tuning.seed % 10007 },
  uSpeed: { value: tuning.speed },
  uTime: { value: 0 },
  uVignette: { value: tuning.vignette },
  uWarp: { value: tuning.warp },
  uWarpScale: { value: tuning.warpScale },
})

/**
 * The quad every wash is drawn on. Time accumulates from the frame deltas the
 * renderer hands over, so a capture stepped at a fixed 1/60 s and a live run
 * both arrive at the same moment after the same number of frames.
 */
function WashPlane({
  generation = 0,
  onFrame,
  tuning,
}: {
  generation?: number
  onFrame?: () => void
  tuning: WashTuning
}) {
  const uniforms = useMemo(() => uniformsOf(tuning), [tuning])
  const time = useRef(0)
  const size = useThree((state) => state.size)

  // A new generation starts the run over from frame zero.
  useEffect(() => {
    time.current = 0
    uniforms.uTime.value = 0
  }, [generation, uniforms])

  useEffect(() => {
    uniforms.uResolution.value = [size.width, size.height]
  }, [size.width, size.height, uniforms])

  useFrame((_, delta) => {
    time.current += delta
    uniforms.uTime.value = time.current
    onFrame?.()
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        depthTest={false}
        depthWrite={false}
        fragmentShader={FRAGMENT}
        transparent
        uniforms={uniforms}
        vertexShader={VERTEX}
      />
    </mesh>
  )
}

/** Watches the canvas for a lost context and reports it once. */
function ContextWatch({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    const canvas = gl.domElement
    const lost = (event: Event) => {
      event.preventDefault()
      onLost()
    }
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [gl, onLost])
  return null
}

/** The wash inside the Studio's capture canvas: stepped by the Studio, drawn on demand. */
export function Capture({ onError, tuning }: CaptureSceneProps) {
  return (
    <>
      <ContextWatch onLost={() => onError('WebGL context lost.')} />
      <WashPlane tuning={asWash(tuning)} />
    </>
  )
}

/** The wash as it runs on a page: its own canvas, filling the stage. */
export function Live({ active, generation, onFailure, onReady, tuning }: LiveSceneProps) {
  const wash = asWash(tuning)
  const ready = useRef(false)
  const announce = () => {
    if (!ready.current) {
      ready.current = true
      onReady()
    }
  }
  return (
    <div style={{ inset: 0, position: 'absolute' }}>
      <Canvas
        dpr={wash.dpr}
        flat
        frameloop={active ? 'always' : 'demand'}
        gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
        linear
        style={{ height: '100%', width: '100%' }}
      >
        <ContextWatch onLost={() => onFailure('WebGL context lost')} />
        <WashPlane generation={generation} onFrame={announce} tuning={wash} />
      </Canvas>
    </div>
  )
}
