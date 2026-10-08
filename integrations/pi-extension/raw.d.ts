// Vite/Vitest bundle the canonical extension as inert text, never execute its hooks in Main.
declare module '*?raw' { const source: string; export default source; }
