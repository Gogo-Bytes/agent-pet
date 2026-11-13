export function FileChanges({ root, paths }: { root: string; paths: string[] }) {
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return <div className="cfg-file-changes">
    <code className="cfg-file-root" title={root}>{root}</code>
    <ul>{paths.map(path => <li key={path}><code title={path}>{path.startsWith(prefix) ? path.slice(prefix.length) : path}</code></li>)}</ul>
  </div>;
}
