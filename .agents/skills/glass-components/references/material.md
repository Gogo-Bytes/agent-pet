# Material study · 2026-10-13

## Sources and conclusions

- [FreeFrontend Liquid Glass examples](https://freefrontend.com/css-liquid-glass/): the lens-button example combines translucent fill, opposed inset highlights, outer shadow, low backdrop blur, and glints. Other examples explore SVG displacement. This collection provides visual techniques; its promotional compatibility and performance claims are not our acceptance criteria.
- [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter): filters affect pixels behind the element; a partially transparent surface is necessary to see them. Ancestor opacity, filters, and backdrop filters can establish backdrop roots and change what a nested filter samples.

## Agent Pet choices

Use a CSS lens impression, not SVG refraction, in the current prototype. The light scene has little texture, so edge lighting contributes more than excessive blur. The future Three.js backdrop will need another visual and performance pass.

| Surface | Treatment | Reason |
| --- | --- | --- |
| Floating independent buttons and Agent tags | Control tint, 10px blur, opposed inner edges | Small readable controls above the scene |
| Animation toolbar | One control surface, transparent child buttons | Avoid nested filters and retain a continuous action group |
| Nonmodal animation palette | Panel tint, 16px blur, stronger elevation | Search and frequent switching require stable contrast |
| Drawer, configuration dialog, settings | Panel tint with restrained reflection | Content clarity outweighs maximum transparency |
| Pet portraits, identity, white footer | No glass | Preserve imagery, hierarchy, and the accepted navigation style |

A transparent popup inside a filtered toolbar can sample only within that backdrop root. Render the animation palette as a sibling of the toolbar in an unfiltered positioning wrapper.

Fallbacks use opaque off-white fill and no backdrop filter. Reduced motion removes transitions; forced colors use system colors and explicit borders. Keep decorative effects in background/shadow layers so they cannot cover content or intercept input. Use no large continuously animated filters. Desktop Electron/WebGL GPU cost is not established by browser prototype review.
