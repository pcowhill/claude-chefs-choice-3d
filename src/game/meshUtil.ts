import * as THREE from 'three';

/** fill a geometry's vertex colors with a flat color */
export function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

let sharedFlat: THREE.MeshLambertMaterial | null = null;

/** shared flat-shaded vertex-color material for all solid props/creatures */
export function flatMat(): THREE.MeshLambertMaterial {
  if (!sharedFlat) {
    sharedFlat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  }
  return sharedFlat;
}
