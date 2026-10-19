import { expect, it } from 'vitest';
import { summarizeHooks } from './hook-status.js';
const hook = { enabled: true, trustStatus: 'untrusted', eventName: 'sessionStart', handlerType: 'command', source: 'user',
  sourcePath: '/isolated/hooks.json', command: 'known command', currentHash: 'SECRET', key: 'SECRET' };
const data = (hooks: unknown[]) => ({ data: [{ hooks, errors: [{message:'SECRET'}], warnings:['SECRET'] }] });
it('keeps trust/enabled counts without leaking paths, commands, keys, hashes or error strings', () => {
  const summary = summarizeHooks(data([hook]), '/isolated/hooks.json', 'known command');
  expect(summary).toEqual({own:1,foreign:0,enabled:1,disabled:0,trusted:0,untrusted:1,modified:0,managed:0,errors:1,warnings:1});
  expect(JSON.stringify(summary)).not.toMatch(/SECRET|isolated|command|currentHash/);
});
it('separates own exact hooks from other sources or commands and unknown event names', () => {
  expect(summarizeHooks(data([hook,{...hook,command:'foreign'},{...hook,sourcePath:'/foreign'},
    {...hook,eventName:'subagentStart'},{...hook,trustStatus:'trusted',enabled:false}]),'/isolated/hooks.json','known command'))
    .toMatchObject({own:2,foreign:3,trusted:1,untrusted:1,enabled:1,disabled:1});
});
it('bounds native lists and rejects malformed trust/enabled fields', () => {
  for (const value of [null,{data:{}}, {data:Array(9).fill({})},data([{...hook,trustStatus:'future'}]),data([{...hook,enabled:'true'}])])
    expect(summarizeHooks(value,'/isolated/hooks.json','known command')).toBeUndefined();
});

it('recognizes only the known macOS tmp alias without merging unrelated sources', () => {
  expect(summarizeHooks(data([{...hook,sourcePath:'/private/tmp/owned/hooks.json'}]),'/tmp/owned/hooks.json','known command')).toMatchObject({own:1,foreign:0});
  expect(summarizeHooks(data([{...hook,sourcePath:'/private/tmp/other/hooks.json'}]),'/tmp/owned/hooks.json','known command')).toMatchObject({own:0,foreign:1});
});
