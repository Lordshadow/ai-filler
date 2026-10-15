import React from 'react';

/**
 * StudioBackdrop
 * Renders the iconic 3D Monochromatic Glassmorphism Studio Scene:
 * - Directional studio spotlight illumination beam
 * - Floating matte charcoal 3D spheres with realistic spherical shading
 * - Faceted platinum geometric polyhedron (low-poly geodesic sphere)
 * - Translucent refractive floating glass cube with specular edges
 * - Ambient blurred refractive orbs for frosted glass diffusion
 *
 * Placed at z-index 0 with pointer-events: none so it never obstructs user clicks or forms.
 */
export default function StudioBackdrop() {
  return (
    <div className="studio-3d-scene" aria-hidden="true">
      {/* Central Studio Spotlight Illumination */}
      <div className="studio-spotlight" />

      {/* Background Refraction Orbs (diffused through frosted glass cards) */}
      <div className="studio-blur-orb studio-blur-orb-1" />
      <div className="studio-blur-orb studio-blur-orb-2" />
      <div className="studio-blur-orb studio-blur-orb-3" />

      {/* Floating 3D Spheres (Matte Charcoal with top-left specular gradient) */}
      <div className="studio-sphere studio-sphere-large-left" />
      <div className="studio-sphere studio-sphere-top-left" />
      <div className="studio-sphere studio-sphere-mid-right" />
      <div className="studio-sphere studio-sphere-bottom-center" />
      <div className="studio-sphere studio-sphere-far-right" />

      {/* Translucent Floating Glass Cube (Upper Right) */}
      <div className="studio-glass-cube">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Top Face */}
          <polygon
            points="50,14 84,33 50,52 16,33"
            fill="rgba(255, 255, 255, 0.28)"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Left Face */}
          <polygon
            points="16,33 50,52 50,88 16,69"
            fill="rgba(255, 255, 255, 0.12)"
            stroke="rgba(255, 255, 255, 0.55)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Right Face */}
          <polygon
            points="84,33 50,52 50,88 84,69"
            fill="rgba(255, 255, 255, 0.18)"
            stroke="rgba(255, 255, 255, 0.70)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Internal Refractive Edge */}
          <line
            x1="50"
            y1="52"
            x2="50"
            y2="88"
            stroke="rgba(255, 255, 255, 0.65)"
            strokeWidth="1.2"
          />
          {/* Specular Catch Highlights */}
          <circle cx="50" cy="14" r="2" fill="#ffffff" />
          <circle cx="84" cy="33" r="1.5" fill="#ffffff" />
        </svg>
      </div>

      {/* Faceted Platinum Polyhedron (Lower Right) */}
      <div className="studio-polyhedron">
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Facets with directional studio lighting */}
          {/* Top Highlight Facets */}
          <polygon points="60,10 88,32 60,48" fill="#ffffff" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
          <polygon points="60,10 32,32 60,48" fill="#f4f4f5" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
          <polygon points="32,32 12,56 42,66" fill="#e4e4e7" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
          <polygon points="88,32 108,56 78,66" fill="#d4d4d8" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
          {/* Center Mid-Tone Facets */}
          <polygon points="60,48 42,66 78,66" fill="#e4e4e7" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
          <polygon points="42,66 60,48 32,32" fill="#d4d4d8" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          <polygon points="78,66 60,48 88,32" fill="#cbd5e1" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          {/* Lower Shadow Facets */}
          <polygon points="42,66 12,56 28,90" fill="#a1a1aa" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
          <polygon points="78,66 108,56 92,90" fill="#71717a" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
          <polygon points="42,66 78,66 60,98" fill="#a1a1aa" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
          <polygon points="42,66 60,98 28,90" fill="#71717a" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
          <polygon points="78,66 60,98 92,90" fill="#52525b" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
          {/* Bottom Dark Cap */}
          <polygon points="60,98 28,90 60,110" fill="#3f3f46" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
          <polygon points="60,98 92,90 60,110" fill="#27272a" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
        </svg>
      </div>
    </div>
  );
}
