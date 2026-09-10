import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../app/poll-refresh.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('from "./model"',`from ${JSON.stringify(new URL('../app/model.ts',import.meta.url).href)}`);
const {parsePollingTable}=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));

test('the poll parser matches columns by header, preserves missing values and cites the report',()=>{
  const headers=['Polling firm','Publication date','Sample size','SDP','HDZ','Možemo','Fokus','Others','Undecided','Most'];
  const cells=['<a href="https://example.org/poll?a=1&amp;b=2">Ipsos</a>','26 Sep 2026','1,002','18.8','24.9','13.6','—','5.0','16.1','9.3'];
  const html=`<table><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr><tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr><tr><td colspan="10">Local elections</td></tr></table>`;
  const polls=parsePollingTable(html);
  assert.equal(polls.length,1);
  assert.equal(polls[0].n,1002);
  assert.equal(polls[0].v.HDZ,24.9);
  assert.equal(polls[0].v.SDP,18.8);
  assert.ok(polls[0].imputed.includes('Fokus'));
  assert.ok(!polls[0].imputed.includes('Mozemo'));
  assert.equal(polls[0].sourceUrl,'https://example.org/poll?a=1&b=2');
});

test('unrecognized poll tables fail without inventing a baseline',()=>{
  assert.throws(()=>parsePollingTable('<table><tr><th>Not a poll</th></tr></table>'),/could not be located/);
});
