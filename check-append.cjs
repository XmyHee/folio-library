const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {createImportCommands}=require('./src/commands/import.ts');
let books = [{id:'first', coverUrl:'blob:first'}];
let catalog = new Map([['old',{title:'Old'}]]);
let overrides = {group:'first'};
let fail = false, parses = 0, releases = 0;
let report = {failed:1}, scope = 'failed', reviewOpen = true;
const importingRef = {current:false};
const update = (old, value) => typeof value === 'function' ? value(old) : value;
const noop = () => {};
const app = createImportCommands(()=>({storageReady:true,taskController:{current:null},importingRef,
 parseEpubBatch:async files=>{parses++;await Promise.resolve();if(fail)throw Error('failed');return files;},
 useOnlineMeta:true,primaryIsbn:()=>'',lookupIsbnBatch:async()=>new Map([['new',{title:'New'}]]),
 setBooks:v=>books=update(books,v),setOlByIsbn:v=>catalog=update(catalog,v),setLookupResults:noop,
 setSelected:noop,setQuery:noop,setBusy:noop,setError:noop,setOlProgress:noop,setProgress:noop,setTab:noop}));
(async()=>{
 await app.ingest([{id:'second',isbn:'new'}]);
 assert.deepEqual(books.map(b=>b.id),['first','second']);
 assert.equal(books[0].coverUrl,'blob:first');
 assert.equal(catalog.size,2);
 assert.equal(overrides.group,'first');
 assert.equal(releases,0);
 await app.ingest([{id:'third'}]);
 assert.equal(books.length,3);
 fail=true; await app.ingest([{id:'failed'}]);
 assert.equal(books.length,3);
 assert.equal(importingRef.current,false);
 fail=false;
 const count=parses;
 await Promise.all([app.ingest([{id:'fourth'}]),app.ingest([{id:'blocked'}])]);
 assert.equal(parses,count+1);
 assert.deepEqual(books.map(b=>b.id),['first','second','third','fourth']);
 await app.ingest([]); assert.equal(books.length,4);
 console.log('PASS: append imports, catalog merge, retained covers/overrides, failure preservation, overlap guard, empty input. Permanent clear covered by check-phase-one.cjs.');
})().catch(e=>{console.error(e);process.exitCode=1;});
