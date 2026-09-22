// TEST FIXTURE ONLY. This replaces unavailable ACL/mount evidence, NOT owner/mode/type/link checks.
// Not exported by the package and never selected using environment, CLI or renderer input.
import { lstat, realpath } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fail } from './errors.js';
import { sameIdentity, validatePath, type FilesystemPolicy, type Identity, type Roots } from './path-policy.js';
export async function fixturePolicy(roots: Roots): Promise<FilesystemPolicy> {
  const pins = new Map<string, Identity>();
  const sticky = new Map<string, Identity>();
  for (const root of Object.values(roots)) {
    validatePath(root);
    if (await realpath(root) !== root) fail('unsupported-path');
    pins.set(root, await lstat(root));
    for (let path = dirname(root); ; path = dirname(path)) {
      const identity = await lstat(path);
      if (identity.mode & 0o1000) sticky.set(path, identity);
      if (path === dirname(path)) break;
    }
  }
  const uid = process.getuid!();
  return { async openRoots(requested) {
    if (requested.storageRoot !== roots.storageRoot || requested.runtimeRoot !== roots.runtimeRoot) fail('unsupported-path');
    return { roots: Object.freeze({ ...roots }), uid,
      async revalidate(_operation, _path, _identity) {
        for (const [path, identity] of pins) if (!sameIdentity(identity, await lstat(path))) fail('path-changed');
      },
      async allowStickyAncestor(path, identity) {
        const pin = sticky.get(path);
        if (!pin || !sameIdentity(pin, identity)) fail('unsafe-mode');
      },
    };
  } };
}
