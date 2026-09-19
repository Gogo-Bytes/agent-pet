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
AnimationMixer behavior, packaged asset resolution and GPU resource disposal.
