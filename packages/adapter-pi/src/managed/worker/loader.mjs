import { readFile } from 'node:fs/promises';
import ts from 'typescript';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.js')) {
    try { return await nextResolve(specifier, context); } catch (error) {
      try { return await nextResolve(`${specifier.slice(0, -3)}.ts`, context); } catch { throw error; }
    }
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = await readFile(new URL(url), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, sourceMap: false } }).outputText;
    return { format: 'module', source: output, shortCircuit: true };
  }
  return nextLoad(url, context);
}
