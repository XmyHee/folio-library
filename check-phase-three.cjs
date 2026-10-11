const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require('fake-indexeddb/auto');
require.extensions['.ts'] = (m,p) => m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {PDFDocument}=require('pdf-lib');
const {saveLibrary,loadLibrary}=require('./src/lib/storage.ts');
const {runPipeline}=require('./src/lib/pipeline.ts');
const {buildLibraryZip}=require('./src/lib/export.ts');
const open=(version)=>new Promise((resolve,reject)=>{const request=indexedDB.open('folio-library',version);request.onupgradeneeded=()=>request.result.createObjectStore('library');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
const transaction=(db,store,action)=>new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);action(tx.objectStore(store))});
(async()=>{
 const doc=await PDFDocument.create();doc.addPage([400,600]);const bytes=await doc.save();
 const base={id:'legacy',file:new Blob([bytes]),originalName:'Legacy.pdf',relativePath:'Legacy.pdf',size:bytes.length,hash:'legacy-hash',status:'ok',kind:'pdf',rawTitle:'Legacy',authors:['Author'],identifiers:[],subjects:[],publisher:'',language:'en',description:'',date:'',series:'',spineCount:1,hasZlibTag:false,manualMetadata:{title:'Manual title',authors:['Manual author']},reviewedMetadataKey:'retained-review'};
 const snapshot={version:1,books:[base],namingMode:1,keepOverrides:{},olByIsbn:new Map(),useOnlineMeta:false,includeDuplicates:true,clearedLibrary:{books:[{...base,id:'undo'}],keepOverrides:{},olByIsbn:new Map(),expiresAt:Date.now()+600000}};
 let db=await open(1);await transaction(db,'library',store=>store.put(snapshot,'current'));db.close();
 const loaded=await loadLibrary();assert.equal(loaded.books[0].id,'legacy');assert.equal(loaded.books[0].manualMetadata.title,'Manual title');assert.equal(loaded.books[0].reviewedMetadataKey,'retained-review');assert.equal(await loaded.clearedLibrary.books[0].file.text(),await base.file.text());
 const put=IDBObjectStore.prototype.put;let assets=0,records=0;
 IDBObjectStore.prototype.put=function(...args){if(this.name==='assets')assets++;if(this.name==='books')records++;return put.apply(this,args)};
 await saveLibrary(loaded);assert.equal(assets,2);assert.equal(records,2);
 assets=records=0;await saveLibrary({...loaded,books:[{...loaded.books[0],manualMetadata:{title:'Updated',authors:['Author']}}]});assert.equal(assets,0);assert.equal(records,1);
 const fresh=await loadLibrary();assets=records=0;await saveLibrary({...fresh,namingMode:2});assert.equal(assets,0);assert.equal(records,0);
 // 600 synthetic real PDFs: persistence, reload, full-byte preservation, one-row update.
 const large=Array.from({length:600},(_,i)=>({...base,id:'large-'+i,hash:'hash-'+i,rawTitle:'Synthetic '+crypto.randomUUID(),manualMetadata:undefined,file:new Blob([bytes,new Uint8Array(65536)]),originalName:`Synthetic ${i}.pdf`}));
 const started=performance.now();await saveLibrary({...fresh,books:large});const recovered=await loadLibrary();assert.equal(recovered.books.length,600);assert.deepEqual(new Uint8Array(await recovered.books[599].file.arrayBuffer()),new Uint8Array(await large[599].file.arrayBuffer()));
 assets=records=0;await saveLibrary({...recovered,books:recovered.books.map((book,i)=>i===300?{...book,manualMetadata:{title:'One correction',authors:['Author']}}:book)});assert.equal(assets,0);assert.equal(records,1);
 const storageElapsed=performance.now()-started;const pipelineStart=performance.now();const derived=runPipeline(recovered.books,1);assert.equal(derived.books.length,600);console.log(`BENCHMARK synthetic 600 PDF / ~38 MiB: save + reload + correction ${Math.round(storageElapsed)} ms; pipeline ${Math.round(performance.now()-pipelineStart)} ms; correction writes 1 metadata row / 0 blobs`);
 // Abort preserves the previous committed settings and original bytes.
 const before=await loadLibrary();let aborted=false;
 IDBObjectStore.prototype.put=function(...args){if(this.name==='assets'&&!aborted){aborted=true;this.transaction.abort();return;}return put.apply(this,args)};
 await assert.rejects(()=>saveLibrary({...before,books:[{...base,id:'abort'}]}));
 IDBObjectStore.prototype.put=put;assert.equal((await loadLibrary()).books.length,600);
 // Simulate another tab committing a newer revision: refuse stale overwrite.
 db=await open(2);await transaction(db,'library',store=>{const r=store.get('settings');r.onsuccess=()=>store.put({...r.result,revision:r.result.revision+1},'settings')});db.close();
 await assert.rejects(()=>saveLibrary(before),/其他页面/);await loadLibrary();
 const exported=runPipeline([base],1).books;
 let controller=new AbortController();controller.abort();await assert.rejects(()=>buildLibraryZip(exported,{includeDuplicates:true},undefined,controller.signal),/取消/);
 controller=new AbortController();await assert.rejects(()=>buildLibraryZip(exported,{includeDuplicates:true},p=>{if(p.current==='生成 ZIP')controller.abort()},controller.signal),/取消/);
 const originalSource=fs.readFileSync('src/lib/parse.ts','utf8');
 const start=originalSource.indexOf('export async function parseEpubBatch('),end=originalSource.indexOf('\n}',start)+2;
 const compiled=ts.transpileModule(originalSource.slice(start,end).replace('export async','async'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const importController=new AbortController();let active=0,max=0;
 const parse=new Function('parseBook','addDocumentCover','revokeCovers',compiled+';return parseEpubBatch;')(async file=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;return file},async book=>{importController.abort();return book},()=>{});
 const partial=await parse(large,()=>{},2,importController.signal);assert.ok(partial.length>=1&&partial.length<=2);assert.ok(max<=2);
 console.log('PASS v1 migration/manual fields/undo, incremental writes, 600-PDF recovery, transaction abort, stale-tab conflict, import partial cancellation and ZIP cancellation before download');
})().catch(error=>{console.error(error);process.exitCode=1});
