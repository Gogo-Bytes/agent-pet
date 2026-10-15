import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../packages/pet-runtime/src/actions.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { actionCatalogVersion, petActionCatalog, createPetArtistTemplate } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
for (const [name, value] of Object.entries({ 'pet.json': createPetArtistTemplate(), 'action-catalog.json': { actionCatalogVersion, actions: petActionCatalog } })) {
  const target = new URL(`../packages/pet-runtime/templates/${name}`, import.meta.url);
  const content = JSON.stringify(value, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== content) throw new Error(`Regenerate ${name}: node scripts/generate-pet-templates.mjs`);
  } else await writeFile(target, content);
}
