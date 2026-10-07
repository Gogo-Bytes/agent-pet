// D6-only lifetime guard around the existing native lease probe. If the harness
// dies at its outer deadline, this child cannot retain a lease indefinitely.
const deadline = setTimeout(() => process.exit(3), 4000);
process.once('disconnect', () => process.exit(3));
try {
  await import('../../../native/managed-darwin/lease-child.mjs');
} catch {
  clearTimeout(deadline);
  // Never forward native/path-bearing exceptions from this fixture process.
  process.exit(3);
}
