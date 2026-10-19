import { vi } from 'vitest';

// Store/controller tests use only their own temporary files. Keep OS volume
// discovery deterministic; durable-file-identity.test.ts tests the query boundary.
vi.mock('node:child_process', async original => {
  const actual = await original<typeof import('node:child_process')>();
  const execFileSync: typeof actual.execFileSync = ((...args: Parameters<typeof actual.execFileSync>) => {
    const [command] = args;
    if (command === '/bin/df') return 'Filesystem 512-blocks Used Available Capacity Mounted on\n/dev/disk3s1 100 20 80 20% /fixture\n';
    if (command === '/usr/sbin/diskutil') return '<?xml version="1.0"?><plist><dict><key>VolumeUUID</key><string>12345678-abcd-1234-abcd-123456789abc</string></dict></plist>';
    return actual.execFileSync(...args);
  }) as typeof actual.execFileSync;
  return { ...actual, execFileSync };
});
