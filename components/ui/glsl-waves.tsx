"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type WaveMode = "hills" | "ocean" | "grid" | "nebula";

interface GLSLWavesProps {
  mode?: WaveMode;
  speed?: number;
  className?: string;
}

function getVertexShader(mode: WaveMode): string {
  const noiseLib = `
    #define GLSLIFY 1
    attribute vec3 position;
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;
    uniform float time;
    varying vec3 vPosition;

    mat4 rotateMatrixX(float radian) {
      return mat4(
        1.0, 0.0, 0.0, 0.0,
        0.0, cos(radian), -sin(radian), 0.0,
        0.0, sin(radian), cos(radian), 0.0,
        0.0, 0.0, 0.0, 1.0
      );
    }

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    vec3 fade(vec3 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

    float cnoise(vec3 P) {
      vec3 Pi0 = floor(P);
      vec3 Pi1 = Pi0 + vec3(1.0);
      Pi0 = mod289(Pi0);
      Pi1 = mod289(Pi1);
      vec3 Pf0 = fract(P);
      vec3 Pf1 = Pf0 - vec3(1.0);
      vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
      vec4 iy = vec4(Pi0.yy, Pi1.yy);
      vec4 iz0 = Pi0.zzzz;
      vec4 iz1 = Pi1.zzzz;
      vec4 ixy = permute(permute(ix) + iy);
      vec4 ixy0 = permute(ixy + iz0);
      vec4 ixy1 = permute(ixy + iz1);
      vec4 gx0 = ixy0 * (1.0 / 7.0);
      vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
      gx0 = fract(gx0);
      vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
      vec4 sz0 = step(gz0, vec4(0.0));
      gx0 -= sz0 * (step(0.0, gx0) - 0.5);
      gy0 -= sz0 * (step(0.0, gy0) - 0.5);
      vec4 gx1 = ixy1 * (1.0 / 7.0);
      vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
      gx1 = fract(gx1);
      vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
      vec4 sz1 = step(gz1, vec4(0.0));
      gx1 -= sz1 * (step(0.0, gx1) - 0.5);
      gy1 -= sz1 * (step(0.0, gy1) - 0.5);
      vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
      vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
      vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
      vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
      vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
      vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
      vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
      vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
      vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110)));
      g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
      vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111)));
      g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
      float n000 = dot(g000, Pf0);
      float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
      float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
      float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
      float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
      float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
      float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
      float n111 = dot(g111, Pf1);
      vec3 fade_xyz = fade(Pf0);
      vec4 n_z = mix(vec4(n000,n100,n010,n110),vec4(n001,n101,n011,n111),fade_xyz.z);
      vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
      float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
      return 2.2 * n_xyz;
    }
  `;

  const mainFns: Record<WaveMode, string> = {
    hills: `
      void main(void) {
        vec3 updatePosition = (rotateMatrixX(radians(90.0)) * vec4(position, 1.0)).xyz;
        float sin1 = sin(radians(updatePosition.x / 128.0 * 90.0));
        vec3 noisePosition = updatePosition + vec3(0.0, 0.0, time * -30.0);
        float noise1 = cnoise(noisePosition * 0.08);
        float noise2 = cnoise(noisePosition * 0.06);
        float noise3 = cnoise(noisePosition * 0.4);
        vec3 lastPosition = updatePosition + vec3(0.0,
          noise1 * sin1 * 8.0
          + noise2 * sin1 * 8.0
          + noise3 * (abs(sin1) * 2.0 + 0.5)
          + pow(sin1, 2.0) * 40.0, 0.0);
        vPosition = lastPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(lastPosition, 1.0);
      }
    `,
    ocean: `
      void main(void) {
        vec3 updatePosition = (rotateMatrixX(radians(90.0)) * vec4(position, 1.0)).xyz;
        float sin1 = sin(radians(updatePosition.x / 128.0 * 90.0));
        vec3 noisePosition = updatePosition + vec3(0.0, 0.0, time * -20.0);
        float noise1 = cnoise(noisePosition * 0.04);
        float noise2 = cnoise(noisePosition * 0.08);
        float noise3 = cnoise(noisePosition * 0.2);
        vec3 lastPosition = updatePosition + vec3(0.0,
          noise1 * sin1 * 12.0
          + noise2 * sin1 * 6.0
          + noise3 * (abs(sin1) * 1.5 + 0.3)
          + pow(sin1, 2.0) * 20.0, 0.0);
        vPosition = lastPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(lastPosition, 1.0);
      }
    `,
    grid: `
      void main(void) {
        vec3 updatePosition = (rotateMatrixX(radians(90.0)) * vec4(position, 1.0)).xyz;
        float sin1 = sin(radians(updatePosition.x / 128.0 * 90.0));
        vec3 noisePosition = updatePosition + vec3(0.0, 0.0, time * -15.0);
        float noise1 = cnoise(noisePosition * 0.1);
        float noise2 = cnoise(noisePosition * 0.3);
        vec3 lastPosition = updatePosition + vec3(0.0,
          noise1 * sin1 * 6.0
          + noise2 * (abs(sin1) * 3.0 + 0.8)
          + pow(sin1, 2.0) * 30.0, 0.0);
        vPosition = lastPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(lastPosition, 1.0);
      }
    `,
    nebula: `
      void main(void) {
        vec3 updatePosition = (rotateMatrixX(radians(90.0)) * vec4(position, 1.0)).xyz;
        float sin1 = sin(radians(updatePosition.x / 128.0 * 90.0));
        vec3 noisePosition = updatePosition + vec3(time * 5.0, 0.0, time * -10.0);
        float noise1 = cnoise(noisePosition * 0.05);
        float noise2 = cnoise(noisePosition * 0.12);
        float noise3 = cnoise(noisePosition * 0.25);
        vec3 lastPosition = updatePosition + vec3(0.0,
          noise1 * sin1 * 14.0
          + noise2 * sin1 * 7.0
          + noise3 * (abs(sin1) * 2.0 + 0.6)
          + pow(sin1, 2.0) * 25.0, 0.0);
        vPosition = lastPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(lastPosition, 1.0);
      }
    `,
  };

  return noiseLib + mainFns[mode];
}

function getFragmentShader(mode: WaveMode): string {
  const frags: Record<WaveMode, string> = {
    hills: `
      precision highp float;
      #define GLSLIFY 1
      varying vec3 vPosition;
      void main(void) {
        float opacity = (96.0 - length(vPosition)) / 256.0 * 1.2;
        vec3 color = vec3(0.45);
        gl_FragColor = vec4(color, opacity);
      }
    `,
    ocean: `
      precision highp float;
      #define GLSLIFY 1
      varying vec3 vPosition;
      void main(void) {
        float opacity = (96.0 - length(vPosition)) / 256.0 * 0.2;
        vec3 color = vec3(0.5, 0.65, 0.8);
        gl_FragColor = vec4(color, opacity);
      }
    `,
    grid: `
      precision highp float;
      #define GLSLIFY 1
      varying vec3 vPosition;
      void main(void) {
        float d = (96.0 - length(vPosition)) / 256.0;
        float grid = 0.5 + 0.5 * sin(vPosition.x * 3.0) * sin(vPosition.z * 3.0);
        float opacity = d * 0.3 * (0.5 + grid * 0.5);
        vec3 color = vec3(0.5, 0.75, 0.9);
        gl_FragColor = vec4(color, opacity);
      }
    `,
    nebula: `
      precision highp float;
      #define GLSLIFY 1
      varying vec3 vPosition;
      void main(void) {
        float d = (96.0 - length(vPosition)) / 256.0;
        float shimmer = 0.7 + 0.3 * sin(vPosition.x * 0.5 + vPosition.z * 0.3);
        float opacity = d * 1.2 * shimmer;
        vec3 color = vec3(0.65, 0.45, 0.95);
        gl_FragColor = vec4(color, opacity);
      }
    `,
  };
  return frags[mode];
}

const MODE_CAMERA: Record<WaveMode, { camZ: number; camY: number; lookY: number }> = {
  hills:  { camZ: 140, camY: 16, lookY: 28 },
  ocean:  { camZ: 130, camY: 20, lookY: 30 },
  grid:   { camZ: 120, camY: 22, lookY: 32 },
  nebula: { camZ: 135, camY: 18, lookY: 26 },
};

const MODE_SPEED: Record<WaveMode, number> = {
  hills: 0.5,
  ocean: 0.5,
  grid: 0.35,
  nebula: 0.3,
};

export default function GLSLWaves({ mode = "hills", speed, className }: GLSLWavesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const planeSize = 256;
    const finalSpeed = speed ?? MODE_SPEED[mode];
    const cam = MODE_CAMERA[mode];

    const uniforms = { time: { type: "f", value: 0 } };
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(planeSize, planeSize, planeSize, planeSize),
      new THREE.RawShaderMaterial({
        uniforms,
        vertexShader: getVertexShader(mode),
        fragmentShader: getFragmentShader(mode),
        transparent: true,
      })
    );

    const canvas = canvasRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
    const clock = new THREE.Clock();
    let animId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const renderLoop = () => {
      uniforms.time.value += clock.getDelta() * finalSpeed;
      renderer.render(scene, camera);
      animId = requestAnimationFrame(renderLoop);
    };

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    camera.position.set(0, cam.camY, cam.camZ);
    camera.lookAt(new THREE.Vector3(0, cam.lookY, 0));
    scene.add(mesh);
    window.addEventListener("resize", resize);
    resize();
    renderLoop();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
      renderer.dispose();
    };
  }, [mode, speed]);

  return (
    <div ref={containerRef} className={className} style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 1,
        }}
      />
    </div>
  );
}
