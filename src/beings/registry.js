// CALEUCHE — Mitos de Chiloé · registry of the six beings
// Order, coordinates and radii are fixed by INTERFACES.md.
import * as THREE from 'three'
import { terrainHeight } from '../world/terrain.js'
import { LORE } from '../lore.js'
import { createPincoya } from './pincoya.js'
import { createTrauco } from './trauco.js'
import { createCamahueto } from './camahueto.js'
import { createInvunche } from './invunche.js'
import { createMillalobo } from './millalobo.js'
import { createSirena } from './sirena.js'

function entry(id, factory, x, z, radius) {
  return {
    id,
    factory,
    radius,
    position: new THREE.Vector3(x, Math.max(terrainHeight(x, z), -0.3), z),
    ...LORE[id], // name, title, lore, blessing
  }
}

export const BEINGS = [
  entry('pincoya', createPincoya, 30, -170, 7),
  entry('trauco', createTrauco, 120, 60, 7),
  entry('camahueto', createCamahueto, -40, 115, 7),
  entry('invunche', createInvunche, -30, -35, 7),
  entry('millalobo', createMillalobo, 140, 140, 9),
  entry('sirena', createSirena, -180, 20, 8),
]
