const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), JSZip = require('jszip');
require.extensions['.ts'] = (m,p) => m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {createExportPlan, partitionExportEntries, MAX_ZIP_BYTES} = require('./src/lib/export-plan.ts');
const {buildLibraryParts,downloadLibraryZip} = require('./src/lib/export.ts');
const base = {id:'1',file:new Blob(['PDF source']),originalName:'same.pdf',size:10,kind:'pdf',status:'ok',resolvedTitle:'Title',resolvedAuthors:['Author'],authors:['Author'],identifiers:[],warnings:[],proposedName:'same.pdf',role:'unique'};
(async()=>{
  const opts={includeDuplicates:true,includeNotes:true,noteTemplate:'{{TITLE}}\n{{FILE_LINK}}'};
  const books=Array.from({length:100},(_,i)=>({...base,id:String(i)}));
  const all=createExportPlan(books,opts);
  const logical=all.entries.map(e=>({...e,packageBytes:100*1024*1024}));
  const groups=partitionExportEntries(logical);
  assert.equal(groups.length,50);
  assert.deepEqual(groups.flat().map(e=>e.book.id),books.map(b=>b.id));
  assert.ok(groups.every(part=>part.reduce((n,e)=>n+e.packageBytes,0)<=MAX_ZIP_BYTES));
  assert.equal(partitionExportEntries(logical.slice(0,2),200*1024*1024).length,1);
  assert.throws(()=>partitionExportEntries([{...logical[0],packageBytes:MAX_ZIP_BYTES+1}]),/256 MiB/);
  const large=books.slice(0,3).map(b=>{const file=new Blob(['x']);Object.defineProperty(file,'size',{value:100*1024*1024});return {...b,file,size:file.size};});
  const bigPlan=createExportPlan(large,{includeDuplicates:true});
  assert.deepEqual(bigPlan.blockers,[]);assert.equal(bigPlan.summary.parts,2);
  const skipped={...base,id:'skip',kind:'other'};
  const input=[...books.slice(0,3),skipped];
  const plan=createExportPlan(input,opts);
  const limit=Math.max(...plan.entries.map(e=>e.packageBytes||0));
  const progress=[],records=[],paths=[];
  let count=0;
  for await(const part of buildLibraryParts(input,opts,p=>progress.push(p),undefined,limit)){
    count++;assert.match(part.filename,new RegExp(`part-00${count}-of-003`));
    const zip=await JSZip.loadAsync(await part.blob.arrayBuffer());
    const csv=await zip.file('folio-export-result.csv').async('string');assert.ok(csv.includes(part.filename));
    assert.equal(part.report.succeeded,1);
    for(const r of part.report.records.filter(r=>r.status==='success')){
      paths.push(r.file);assert.equal(await zip.file(r.file).async('string'),'PDF source');
      const note=await zip.file(r.note).async('string');
      assert.ok(note.includes(encodeURIComponent(r.file.split('/').pop())));
    }
    records.push(...part.report.records);
  }
  assert.equal(count,3);assert.equal(records.length,4);assert.equal(records.filter(r=>r.status==='skipped').length,1);
  assert.equal(new Set(paths).size,3);assert.deepEqual(paths,plan.entries.filter(e=>e.path).map(e=>e.path));
  assert.ok(progress.some(p=>p.current.includes('第 3/3 包')));
  const cancel=new AbortController(),iter=buildLibraryParts(input,opts,undefined,cancel.signal,limit);
  assert.equal((await iter.next()).done,false);cancel.abort();await assert.rejects(()=>iter.next(),/取消/);
  const originals={...base,id:'original',coverPreference:'title',titleCoverBlob:new Blob(['cover'])};
  const retained=createExportPlan([originals],{includeDuplicates:true});assert.ok(retained.entries[0].packageBytes>base.file.size*2);
  assert.equal(partitionExportEntries(retained.entries).flat()[0].originalPath,retained.entries[0].originalPath);
  const downloads=[];let stop;
  global.window={setTimeout:fn=>{fn();return 0}};
  global.document={body:{appendChild(){}},createElement:()=>({click(){downloads.push(this.download);stop?.abort()},remove(){}})};
  const downloaded=await downloadLibraryZip(large,{includeDuplicates:true});
  assert.equal(downloads.length,2);assert.equal(downloaded.succeeded,3);
  assert.equal(new Set(downloaded.records.map(r=>r.archive)).size,2);
  assert.ok(downloaded.records.every(r=>downloads.includes(r.archive)));
  downloads.length=0;stop=new AbortController();
  await assert.rejects(()=>downloadLibraryZip(large,{includeDuplicates:true},undefined,stop.signal),/已发起 1 个分包/);
  assert.equal(downloads.length,1);
  console.log('PASS automatic parts: 100 books, capacity boundaries, total >256 MiB, stable collision-free paths, notes and sources together, per-part CSV, exclusions once, progress and cancellation');
})().catch(error=>{console.error(error);process.exitCode=1});
