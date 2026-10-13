# Material study · 2026-10-13

## Sources and conclusions

- [FreeFrontend Liquid Glass examples](https://freefrontend.com/css-liquid-glass/): the lens-button example combines translucent fill, opposed inset highlights, outer shadow, low backdrop blur, and glints. Other examples explore SVG displacement. This collection provides visual techniques; its promotional compatibility and performance claims are not our acceptance criteria.
- [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter): filters affect pixels behind the element; a partially transparent surface is necessary to see them. Ancestor opacity, filters, and backdrop filters can establish backdrop roots and change what a nested filter samples.

## Agent Pet choices

The first pass used CSS frost only and was rejected as visually too close to ordinary white cards. The revised prototype uses SVG background displacement for small controls, and lighter frost for reading panels. This supersedes the initial choice to avoid SVG. The light scene has little texture, so edge lighting contributes more than excessive blur. The future Three.js backdrop will need another visual and performance pass.

| Surface | Treatment | Reason |
| --- | --- | --- |
| Floating independent buttons and Agent tags | Low tint, rounded-bezel displacement, directional reflection | Small readable controls above the scene |
| Animation toolbar | One control surface, transparent child buttons | Avoid nested filters and retain a continuous action group |
| Nonmodal animation palette | Panel tint, 8px blur, stronger elevation | Search and frequent switching require stable contrast |
| Drawer, configuration dialog, settings | Panel tint with restrained reflection | Content clarity outweighs maximum transparency |
| Pet portraits, identity, white footer | No glass | Preserve imagery, hierarchy, and the accepted navigation style |

A transparent popup inside a filtered toolbar can sample only within that backdrop root. Render the animation palette as a sibling of the toolbar in an unfiltered positioning wrapper. Refraction lives in an absolute decorative layer; parent content is not filtered.

Fallbacks use opaque off-white fill and no backdrop filter. Reduced motion removes transitions; forced colors use system colors and explicit borders. Keep decorative effects in background/shadow layers so they cannot cover content or intercept input. Use no large continuously animated filters. Desktop Electron/WebGL GPU cost is not established by browser prototype review.

## Deeper source study and implementation correction

- [DaftPlug source](https://codepen.io/daftplug/pen/QwbaYGO): uses separate pseudo-elements for rim/tint and filtered background. Its noise-driven distortion is visually stronger, but is not a geometrically derived rounded lens.
- [Lucas Romero source](https://github.com/lucasromerodb/liquid-glass-effect-macos): separates effect, tint, shine, and content. Adapt the separation principle, not the full demo's turbulence strength or elastic sizing.
- [Fooontic switcher source](https://codepen.io/fooontic/pen/KwpRaGr): low tint, multiple directional light/dark inset reflections, and a moving inner selection surface. Useful for thickness even on a quiet background.
- [Kube's refraction article](https://kube.io/blog/liquid-glass-css-svg/): derives background displacement from a bezel surface and combines it with highlights. Its demo is explicitly experimental and Chromium-specific; map dimensions must track component size.

Our implementation is an artistic rounded-bezel displacement approximation, not a physical Snell-law solver. It encodes a smooth inward displacement around the rounded rectangle, keeps the center neutral, and softens the result. ResizeObserver schedules rebuilding only when measured size/radius changes, with a 256,000 pixel area cap; unsupported rendering remains an unverified browser fallback until tested there. Avoid claiming `@supports` verifies SVG-backdrop rendering.

Visual acceptance must show actual bends in the line study as well as clear text and a visible rim in the product. A flat pastel scene naturally offers fewer recognizable refracted details; do not add noisy scenery solely to advertise glass.
