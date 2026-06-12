// src/fx.js — post-processing ("HD" pipeline)
// RenderPass -> UnrealBloomPass -> final grade ShaderPass (vignette, grain,
// chromatic aberration, dread grade, dread pulse). Adds ZERO lights.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
	name: 'CaleucheGradeShader',

	uniforms: {
		tDiffuse: { value: null },
		uTime: { value: 0.0 },
		uDread: { value: 0.0 },
		uCalm: { value: 0.0 }, // win-card ease: settles grain/aberration/grade
		uResolution: { value: new THREE.Vector2( 1, 1 ) }
	},

	vertexShader: /* glsl */`
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,

	fragmentShader: /* glsl */`
		uniform sampler2D tDiffuse;
		uniform float uTime;
		uniform float uDread;
		uniform float uCalm;
		uniform vec2 uResolution;
		varying vec2 vUv;

		// cheap stable hash for film grain
		float hash21( vec2 p ) {
			vec3 p3 = fract( vec3( p.xyx ) * 443.8975 );
			p3 += dot( p3, p3.yzx + 19.19 );
			return fract( ( p3.x + p3.y ) * p3.z );
		}

		void main() {
			vec2 centered = vUv - 0.5;
			float r = length( centered ) * 2.0; // 0 center, 1 edge midpoints, ~1.41 corners

			// --- chromatic aberration: grows with radius and dread, max ~3px at edges;
			//     eased almost out while the win card is up ---
			float aberrPx = ( 0.8 + 2.2 * uDread ) * smoothstep( 0.15, 1.2, r ) * ( 1.0 - 0.7 * uCalm );
			vec2 dir = centered / max( r * 0.5, 1e-4 ); // unit radial direction
			vec2 off = dir * ( aberrPx / uResolution );
			vec4 base = texture2D( tDiffuse, vUv );
			float cr = texture2D( tDiffuse, vUv + off ).r;
			float cb = texture2D( tDiffuse, vUv - off ).b;
			vec3 col = vec3( cr, base.g, cb );

			// --- tone map (scene is rendered linear HDR into the composer target) ---
			#if defined( TONE_MAPPING )
				col = toneMapping( col );
			#endif

			// --- desaturate + cold green-teal grade, lerped by dread * 0.5 ---
			float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
			vec3 graded = mix( vec3( luma ), col, 0.55 ) * vec3( 0.72, 1.0, 0.92 );
			col = mix( col, graded, uDread * 0.5 * ( 1.0 - 0.6 * uCalm ) );

			// --- vignette: smoothstep falloff, base 0.35 + 0.35 * dread (dread part calmed on win) ---
			float vig = smoothstep( 0.45, 1.25, r );
			col *= 1.0 - ( 0.35 + 0.35 * uDread * ( 1.0 - 0.7 * uCalm ) ) * vig;

			// --- dread > 0.7: slow ~1 Hz darkening pulse (silenced on win) ---
			float pulseAmp = max( uDread - 0.7, 0.0 ) / 0.3 * 0.18 * ( 1.0 - uCalm );
			col *= 1.0 - pulseAmp * ( 0.5 + 0.5 * sin( uTime * 6.2831853 ) );

			// --- animated film grain: zero-mean (luminance-preserving), 0.035 + 0.05 * dread;
			//     settles to a faint 0.016 while the win card is read ---
			vec2 grainSeed = vUv * uResolution
				+ vec2( fract( uTime * 13.37 ) * 71.31, fract( uTime * 7.91 ) * 113.17 );
			float n = hash21( grainSeed );
			col += ( n - 0.5 ) * mix( 0.035 + 0.05 * uDread, 0.016, uCalm );

			gl_FragColor = linearToOutputTexel( vec4( max( col, vec3( 0.0 ) ), base.a ) );
		}`
};

export function createFX( renderer, scene, camera ) {

	const size = renderer.getSize( new THREE.Vector2() );

	// Multisampled HDR target so MSAA is not lost going through the composer.
	const renderTarget = new THREE.WebGLRenderTarget(
		Math.max( 1, size.width ),
		Math.max( 1, size.height ),
		{ type: THREE.HalfFloatType, samples: 4 }
	);

	const composer = new EffectComposer( renderer, renderTarget );

	const renderPass = new RenderPass( scene, camera );
	composer.addPass( renderPass );

	const bloomPass = new UnrealBloomPass(
		new THREE.Vector2( size.width, size.height ),
		0.5,  // strength
		0.55, // radius
		0.6   // threshold — glows/lanterns/sails bloom, the dark scene does not
	);
	composer.addPass( bloomPass );

	const gradePass = new ShaderPass( GradeShader );
	composer.addPass( gradePass );

	const uniforms = gradePass.uniforms; // ShaderPass clones the shader's uniforms

	let dread = 0;
	let calm = 0;
	let time = 0;

	function resize( width, height ) {
		const pixelRatio = Math.min( renderer.getPixelRatio() || 1, 1.5 );
		composer.setPixelRatio( pixelRatio );
		composer.setSize( width, height ); // propagates to every pass
		uniforms.uResolution.value.set( width * pixelRatio, height * pixelRatio );
	}

	function render( dt ) {
		time += dt;
		if ( time > 3600 ) time -= 3600; // keep sin()/grain precision over long sessions
		uniforms.uTime.value = time;
		composer.render( dt );
	}

	resize( size.width, size.height );

	return {
		render,
		resize,
		get dread() { return dread; },
		set dread( v ) {
			dread = v < 0 ? 0 : ( v > 1 ? 1 : v );
			uniforms.uDread.value = dread;
		},
		get calm() { return calm; },
		set calm( v ) {
			calm = v < 0 ? 0 : ( v > 1 ? 1 : v );
			uniforms.uCalm.value = calm;
		}
	};

}
