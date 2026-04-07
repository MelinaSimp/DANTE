"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type WaveMode = "hills" | "ocean" | "grid" | "nebula";

interface GLSLWavesProps {
  mode?: WaveMode;
  speed?: number;
  color?: [number, number, number];
  opacity?: number;
  className?: string;
}

const VERTEX_SHARED = `
  #define GLSLIFY 1
  attribute vec3 position;
  uniform mat4 projectionMatrix;
  uniform mat4 modelViewMatrix;
  uniform float time;
  varying vec3 vPosition;

  mat4 rotateX(float r){return mat4(1,0,0,0,0,cos(r),-sin(r),0,0,sin(r),cos(r),0,0,0,0,1);}

  vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
  vec3 fade(vec3 t){return t*t*t*(t*(t*6.-15.)+10.);}

  float cnoise(vec3 P){
    vec3 Pi0=floor(P),Pi1=Pi0+vec3(1.);
    Pi0=mod289(Pi0);Pi1=mod289(Pi1);
    vec3 Pf0=fract(P),Pf1=Pf0-vec3(1.);
    vec4 ix=vec4(Pi0.x,Pi1.x,Pi0.x,Pi1.x);
    vec4 iy=vec4(Pi0.yy,Pi1.yy);
    vec4 iz0=Pi0.zzzz,iz1=Pi1.zzzz;
    vec4 ixy=permute(permute(ix)+iy);
    vec4 ixy0=permute(ixy+iz0),ixy1=permute(ixy+iz1);
    vec4 gx0=ixy0*(1./7.),gy0=fract(floor(gx0)*(1./7.))-.5;
    gx0=fract(gx0);vec4 gz0=vec4(.5)-abs(gx0)-abs(gy0);
    vec4 sz0=step(gz0,vec4(0.));
    gx0-=sz0*(step(0.,gx0)-.5);gy0-=sz0*(step(0.,gy0)-.5);
    vec4 gx1=ixy1*(1./7.),gy1=fract(floor(gx1)*(1./7.))-.5;
    gx1=fract(gx1);vec4 gz1=vec4(.5)-abs(gx1)-abs(gy1);
    vec4 sz1=step(gz1,vec4(0.));
    gx1-=sz1*(step(0.,gx1)-.5);gy1-=sz1*(step(0.,gy1)-.5);
    vec3 g000=vec3(gx0.x,gy0.x,gz0.x),g100=vec3(gx0.y,gy0.y,gz0.y);
    vec3 g010=vec3(gx0.z,gy0.z,gz0.z),g110=vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001=vec3(gx1.x,gy1.x,gz1.x),g101=vec3(gx1.y,gy1.y,gz1.y);
    vec3 g011=vec3(gx1.z,gy1.z,gz1.z),g111=vec3(gx1.w,gy1.w,gz1.w);
    vec4 norm0=taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110)));
    g000*=norm0.x;g010*=norm0.y;g100*=norm0.z;g110*=norm0.w;
    vec4 norm1=taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111)));
    g001*=norm1.x;g011*=norm1.y;g101*=norm1.z;g111*=norm1.w;
    float n000=dot(g000,Pf0),n100=dot(g100,vec3(Pf1.x,Pf0.yz));
    float n010=dot(g010,vec3(Pf0.x,Pf1.y,Pf0.z)),n110=dot(g110,vec3(Pf1.xy,Pf0.z));
    float n001=dot(g001,vec3(Pf0.xy,Pf1.z)),n101=dot(g101,vec3(Pf1.x,Pf0.y,Pf1.z));
    float n011=dot(g011,vec3(Pf0.x,Pf1.yz)),n111=dot(g111,Pf1);
    vec3 f=fade(Pf0);
    vec4 nz=mix(vec4(n000,n100,n010,n110),vec4(n001,n101,n011,n111),f.z);
    vec2 ny=mix(nz.xy,nz.zw,f.y);
    return 2.2*mix(ny.x,ny.y,f.x);
  }
`;

function getVertexMain(mode: WaveMode): string {
  switch (mode) {
    case "ocean":
      return `
        void main(void){
          vec3 p=(rotateX(radians(90.))*vec4(position,1.)).xyz;
          float s=sin(radians(p.x/128.*90.));
          vec3 np=p+vec3(0.,0.,time*-20.);
          float n1=cnoise(np*0.04);
          float n2=cnoise(np*0.08);
          float n3=cnoise(np*0.2);
          vec3 lp=p+vec3(0.,
            n1*s*12.+n2*s*6.+n3*(abs(s)*1.5+0.3)
            +pow(s,2.)*20.,0.);
          vPosition=lp;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(lp,1.);
        }`;
    case "grid":
      return `
        void main(void){
          vec3 p=(rotateX(radians(90.))*vec4(position,1.)).xyz;
          float s=sin(radians(p.x/128.*90.));
          vec3 np=p+vec3(0.,0.,time*-15.);
          float n1=cnoise(np*0.1);
          float n2=cnoise(np*0.3);
          vec3 lp=p+vec3(0.,
            n1*s*6.+n2*(abs(s)*3.+0.8)
            +pow(s,2.)*30.,0.);
          vPosition=lp;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(lp,1.);
        }`;
    case "nebula":
      return `
        void main(void){
          vec3 p=(rotateX(radians(90.))*vec4(position,1.)).xyz;
          float s=sin(radians(p.x/128.*90.));
          vec3 np=p+vec3(time*5.,0.,time*-10.);
          float n1=cnoise(np*0.05);
          float n2=cnoise(np*0.12);
          float n3=cnoise(np*0.25);
          vec3 lp=p+vec3(0.,
            n1*s*14.+n2*s*7.+n3*(abs(s)*2.+0.6)
            +pow(s,2.)*25.,0.);
          vPosition=lp;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(lp,1.);
        }`;
    default: // hills
      return `
        void main(void){
          vec3 p=(rotateX(radians(90.))*vec4(position,1.)).xyz;
          float s=sin(radians(p.x/128.*90.));
          vec3 np=p+vec3(0.,0.,time*-30.);
          float n1=cnoise(np*0.08);
          float n2=cnoise(np*0.06);
          float n3=cnoise(np*0.4);
          vec3 lp=p+vec3(0.,
            n1*s*8.+n2*s*8.+n3*(abs(s)*2.+0.5)
            +pow(s,2.)*40.,0.);
          vPosition=lp;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(lp,1.);
        }`;
  }
}

function getFragmentShader(mode: WaveMode, color: [number, number, number], opacity: number): string {
  const [r, g, b] = color;
  switch (mode) {
    case "grid":
      return `
        precision highp float;
        varying vec3 vPosition;
        void main(void){
          float d=(96.-length(vPosition))/256.;
          float grid=0.5+0.5*sin(vPosition.x*3.)*sin(vPosition.z*3.);
          float a=d*${opacity.toFixed(2)}*(0.4+grid*0.6);
          gl_FragColor=vec4(${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)},a);
        }`;
    case "nebula":
      return `
        precision highp float;
        varying vec3 vPosition;
        void main(void){
          float d=(96.-length(vPosition))/256.;
          float shimmer=0.7+0.3*sin(vPosition.x*0.5+vPosition.z*0.3);
          float a=d*${opacity.toFixed(2)}*shimmer;
          gl_FragColor=vec4(${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)},a);
        }`;
    default:
      return `
        precision highp float;
        varying vec3 vPosition;
        void main(void){
          float a=(96.-length(vPosition))/256.*${opacity.toFixed(2)};
          gl_FragColor=vec4(${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)},a);
        }`;
  }
}

const MODE_DEFAULTS: Record<WaveMode, { color: [number, number, number]; opacity: number; speed: number; camZ: number; camY: number; lookY: number }> = {
  hills:  { color: [0.55, 0.55, 0.55], opacity: 0.6,  speed: 0.4,  camZ: 140, camY: 16, lookY: 28 },
  ocean:  { color: [0.35, 0.55, 0.75], opacity: 0.55, speed: 0.5,  camZ: 130, camY: 20, lookY: 30 },
  grid:   { color: [0.4, 0.8, 0.6],    opacity: 0.5,  speed: 0.35, camZ: 120, camY: 22, lookY: 32 },
  nebula: { color: [0.6, 0.4, 0.85],   opacity: 0.5,  speed: 0.3,  camZ: 135, camY: 18, lookY: 26 },
};

export default function GLSLWaves({ mode = "hills", speed, color, opacity, className }: GLSLWavesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const defaults = MODE_DEFAULTS[mode];
    const finalSpeed = speed ?? defaults.speed;
    const finalColor = color ?? defaults.color;
    const finalOpacity = opacity ?? defaults.opacity;
    const planeSize = 256;

    const vertexShader = VERTEX_SHARED + getVertexMain(mode);
    const fragmentShader = getFragmentShader(mode, finalColor, finalOpacity);

    const uniforms = { time: { value: 0 } };

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(planeSize, planeSize, planeSize, planeSize),
      new THREE.RawShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true })
    );

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
    const clock = new THREE.Clock();
    let animId: number;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    const loop = () => {
      uniforms.time.value += clock.getDelta() * finalSpeed;
      renderer.render(scene, camera);
      animId = requestAnimationFrame(loop);
    };

    renderer.setClearColor(0x000000, 0);
    camera.position.set(0, defaults.camY, defaults.camZ);
    camera.lookAt(new THREE.Vector3(0, defaults.lookY, 0));
    scene.add(mesh);
    resize();
    window.addEventListener("resize", resize);
    loop();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
      renderer.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    };
  }, [mode, speed, color, opacity]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}
