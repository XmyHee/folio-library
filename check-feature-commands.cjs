const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, filename);
const {createImportCommands} = require('./src/commands/import.ts');
const {createExportCommands} = require('./src/commands/export.ts');
const {createCatalogCommands} = require('./src/commands/catalog.ts');
const {createMetadataCommands} = require('./src/commands/metadata.ts');
const {createCoversCommands} = require('./src/commands/covers.ts');
const noop = () => {};
const deferred = () => {let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve};};
(async () => {
  let gate = deferred(), parses = 0, downloads = 0, csv = 0;
  const previousReport = {id:'previous'};
  const state = {
    storageReady:true, busy:false, exporting:false, importingRef:{current:false}, taskController:{current:null},
    csvDownloadLock:{current:false}, exportPlan:{summary:{files:1},blockers:[]}, exportBooks:[{id:'export'}],
    batchBooks:[{id:'selected'}], useOnlineMeta:false, books:[], exportReport:previousReport,
    setError:value => state.error=value, setBusy:value => state.busy=value,
    setExporting:value => state.exporting=value, setExportProgress:value => state.exportProgress=value,
    setExportReport:value => state.exportReport=value, setShowExportReview:noop, setCsvDownloading:noop,
    setOlProgress:noop, setProgress:noop, setQuery:noop, setSelected:noop, setTab:noop,
    setBooks:value => state.books=typeof value==='function'?value(state.books):value,
    parseEpubBatch:async () => {parses++; await gate.promise; return [{id:'completed'}];},
    downloadLibraryZip:async () => {downloads++; await gate.promise; throw Error('export failed');},
    downloadCsv:books => {csv++; assert.equal(books, state.batchBooks);},
  };
  const imports=createImportCommands(()=>state), exports=createExportCommands(()=>state);
  const importing=imports.ingest([{name:'book.pdf'}]);
  assert.equal(state.importingRef.current,true);
  await exports.handleExport(); assert.equal(downloads,0);
  state.taskController.current.abort();
  await imports.ingest([{name:'overlap.pdf'}]); assert.equal(parses,1);
  assert.equal(state.importingRef.current,true);
  gate.resolve(); await importing;
  assert.deepEqual(state.books.map(b=>b.id),['completed']);
  assert.match(state.error,/导入已停止/); assert.equal(state.importingRef.current,false);
  assert.equal(state.taskController.current,null); assert.equal(state.busy,false);

  gate=deferred(); const exporting=exports.handleExport();
  await imports.ingest([{name:'blocked.pdf'}]); assert.equal(parses,1);
  exports.exportCsv(); assert.equal(csv,0);
  gate.resolve(); await exporting;
  assert.equal(state.exportReport,previousReport); assert.equal(state.error,'export failed');
  assert.equal(state.exportProgress,null); assert.equal(state.exporting,false);
  assert.equal(state.importingRef.current,false); assert.equal(state.taskController.current,null);
  state.exportPlan.blockers=['blocked']; await exports.handleExport(); assert.equal(downloads,1);
  state.storageReady=false; exports.exportCsv(); assert.equal(csv,0);
  state.storageReady=true; exports.exportCsv(); exports.exportCsv(); assert.equal(csv,1);

  const hits=new Map([['existing',{title:'Keep'}]]), results={};
  Object.assign(state,{useOnlineMeta:true,viewBooks:[{isbn:'first'}],primaryIsbn:()=>'',
    setLookupSummary:value=>state.summary=value,
    setOlByIsbn:value=>{const next=value(hits);hits.clear();for(const entry of next)hits.set(...entry);},
    setLookupResults:value=>Object.assign(results,value(results)),
    lookupIsbnBatch:async (isbns,progress,limit,options)=>{
      assert.deepEqual(isbns,['latest']);assert.equal(limit,2);assert.equal(options.force,true);
      options.onResult('latest',{status:'found',hit:{title:'New'}});
      return new Map([['latest',{title:'New'}]]);
    },
  });
  const catalog=createCatalogCommands(()=>state);
  state.viewBooks=[{isbn:'latest'}]; await catalog.retryCatalog();
  assert.equal(hits.get('existing').title,'Keep');assert.equal(hits.get('latest').title,'New');
  assert.match(state.summary,/匹配 1 项/);assert.equal(state.importingRef.current,false);

  let writes=0;
  Object.assign(state,{metadataDirty:true,setBooks:()=>writes++,reviewKey:()=> 'reviewed'});
  const metadata=createMetadataCommands(()=>state);
  metadata.confirmMetadataReview({id:'one'});assert.equal(writes,0);
  state.metadataDirty=false;metadata.confirmMetadataReview({id:'one'});assert.equal(writes,1);
  const covers=createCoversCommands(()=>state);
  state.importingRef.current=true;covers.useOriginalCover({id:'one'});assert.equal(writes,1);
  state.importingRef.current=false;covers.useOriginalCover({id:'one'});assert.equal(writes,2);
  console.log('PASS public feature commands: shared import/export lock, abort without early unlock, partial import retention, failed export receipt preservation, blockers, CSV cooldown/readiness, latest catalog scope/merge, dirty-review and cover guards');
})().catch(error=>{console.error(error);process.exitCode=1;});
