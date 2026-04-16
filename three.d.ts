// Shim for three.js — the installed version (0.183.x) doesn't bundle its own
// .d.ts files. This minimal declaration silences the TS7016 "implicitly any"
// error on `import * as THREE from "three"` and lets THREE types (THREE.Mesh,
// etc.) be used as type annotations.
// Replace by running `npm install --save-dev @types/three` if strict typings
// are ever needed.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "three" {
  // Expose each constructor that is used in the codebase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Scene: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const PerspectiveCamera: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const WebGLRenderer: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const PlaneGeometry: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const ShaderMaterial: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Mesh: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const DirectionalLight: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const AmbientLight: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Vector2: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Vector3: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Color: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const TextureLoader: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Clock: new (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const RawShaderMaterial: new (...args: any[]) => any;
  export const DoubleSide: number;
  export const FrontSide: number;
  export const BackSide: number;

  // Type aliases so `mesh: THREE.Mesh` etc. work as type annotations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Mesh = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Scene = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Camera = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Object3D = any;
}
