# Starter Pet

`starter.glb` is a project-authored low-poly robot fixture for desktop integration,
not a finished commercial avatar. Geometry and animation data are dedicated to
CC0-1.0 (https://creativecommons.org/publicdomain/zero/1.0/).
No third-party models, textures or animations are included.

Reproduce from the repository root:

```sh
node scripts/generate-starter-pet.mjs
```

The model contains box-based robot parts and embedded `Idle`, `Work`, `Success`,
and `Error` translation animations. It contains no images, external resources,
or compression extensions. Its intended use is validating real GLB parsing,
Drei animation behavior, packaged asset resolution and cache-safe remounting.
The renderer uses useGLTF/useAnimations; this package exports only pure asset
contracts/status mappings and the asset URL, not a second loader or mixer.

All clips are LINEAR translations of the top-level `Pet` node. The renderer's
bundled-animation envelope unions their keyframe extrema with the rest bounds.
Changing this asset to rotations, skinning, nested animation or cubic tracks
requires updating that explicitly fixture-specific framing rule and its tests;
it is not a general custom-asset framing/import implementation.
