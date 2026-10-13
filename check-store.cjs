const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'https://folio.test/'});
for (const name of ['window','document','HTMLElement','sessionStorage','Event','BeforeUnloadEvent']) global[name] = dom.window[name];
global.IS_REACT_ACT_ENVIRONMENT = true;
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
}).outputText, filename);
const React = require('react');
const {renderHook,act,waitFor,cleanup} = require('@testing-library/react');
const {createFolioStore} = require('./src/state/folio-store.ts');
const {FolioStoreProvider} = require('./src/state/FolioStoreProvider.tsx');
const {useFolioSelector} = require('./src/state/folio-context.ts');
const {createFolioSelectors} = require('./src/state/selectors.ts');
const {useLibraryState} = require('./src/hooks/useLibraryState.ts');
const {useTaskState} = require('./src/hooks/useTaskState.ts');
const {useBookDetails} = require('./src/hooks/useBookDetails.ts');
const {useLibraryView} = require('./src/hooks/useLibraryView.ts');
const {createWorkbenchCommands} = require('./src/commands/workbench.ts');
const storage = require('./src/lib/storage.ts');
const assets = require('./src/lib/book-assets.ts');
const original = {load:storage.loadLibrary,save:storage.saveLibrary,revoke:assets.revokeCovers};
const deferred = () => {let resolve,reject;const promise = new Promise((yes,no) => {resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick = () => new Promise(resolve => setTimeout(resolve,0));
const book = id => ({id,file:new File(['source '+id],id+'.pdf'),originalName:id+'.pdf',relativePath:id+'.pdf',size:12,hash:id,
  status:'ok',rawTitle:'Title '+id,authors:['Author'],publisher:'',language:'en',identifiers:[],description:'',date:'',subjects:[],series:'',spineCount:1,hasZlibTag:false,kind:'pdf'});
const snapshot = books => ({version:1,books,namingMode:1,keepOverrides:{},olByIsbn:new Map(),useOnlineMeta:false,includeDuplicates:true,
  exportSettings:{noteTemplate:'{{TITLE}}',includeNotes:true}});
function mount(store) {
  const selectors=createFolioSelectors();
  const wrapper=({children})=>React.createElement(FolioStoreProvider,{store},children);
  const hook=renderHook(()=>{
    const busy=useFolioSelector(s=>s.busy);
    const library=useLibraryState(busy), task=useTaskState();
    const state=store.getState(), pipeline=selectors.pipeline(state);
    const view=useLibraryView(pipeline), details=useBookDetails(pipeline.books,state.busy,state.exporting,task.setError);
    return {library,task,view,details};
  },{wrapper,reactStrictMode:true});
  function commands(services={}) {
    return createWorkbenchCommands(store,()=>({clearLibrary:hook.result.current.library.clearLibrary,details:hook.result.current.details}),services);
  }
  return {hook,commands,selectors};
}

async function appendAndCancel() {
  sessionStorage.clear();
  const old=book('old'); old.manualMetadata={title:'Reviewed title',authors:['Reviewed author']};
  storage.loadLibrary=async()=>snapshot([old]); storage.saveLibrary=async()=>{};
  const store=createFolioStore(), {hook,commands,selectors}=mount(store);
  await waitFor(()=>assert.equal(store.getState().storageReady,true));
  let parses=0, downloads=0, nextBatch=[book('first')], gate=null;
  const services={parseEpubBatch:async()=>{parses++;if(gate)await gate.promise;return nextBatch;},primaryIsbn:()=>'',lookupIsbnBatch:async()=>new Map(),
    downloadLibraryZip:async()=>{downloads++;return {records:[]};},downloadCsv:()=>{}};
  const imports=commands(services), exports=imports, clears=imports;
  await act(async()=>{await imports.ingest([new File(['a'],'a.pdf')]);});
  nextBatch=[book('second')];
  await act(async()=>{await imports.ingest([new File(['b'],'b.pdf')]);});
  assert.deepEqual(store.getState().books.map(b=>b.id),['old','first','second']);
  assert.equal(store.getState().books[0],old,'existing source and manual metadata are retained');
  assert.equal(selectors.pipeline(store.getState()).books[0].resolvedTitle,'Reviewed title');
  console.log('PASS STORE-01: consecutive imports append and preserve reviewed records');

  gate=deferred();nextBatch=[book('partial')];let importing;
  act(()=>{importing=imports.ingest([new File(['c'],'c.pdf')]);});
  const locked=store.getState().runtime.importingRef;
  act(()=>hook.result.current.task.cancelTask());
  assert.equal(store.getState().runtime.taskController.current.signal.aborted,true);
  assert.equal(locked.current,true);assert.equal(store.getState().busy,true);
  await act(async()=>{
    await imports.ingest([new File(['d'],'d.pdf')]);await exports.handleExport();await clears.clearAll();
  });
  assert.equal(parses,3,'another import cannot start during cancellation');assert.equal(downloads,0);
  assert.deepEqual(store.getState().books.map(b=>b.id),['old','first','second']);
  await act(async()=>{gate.resolve();await importing;});
  assert.equal(locked.current,false);assert.equal(store.getState().busy,false);assert.equal(store.getState().runtime.taskController.current,null);
  assert.deepEqual(store.getState().books.map(b=>b.id),['old','first','second','partial']);
  assert.match(store.getState().error,/导入已停止/);
  console.log('PASS STORE-02: cancellation retains the cross-feature lock until settlement, then keeps completed results');
  hook.unmount();
}

async function failedRestore() {
  const gate=deferred(), saved=snapshot([book('on-disk')]);let writes=0,parses=0;
  storage.loadLibrary=()=>gate.promise;storage.saveLibrary=async()=>{writes++;};
  const store=createFolioStore(), {hook,commands}=mount(store);
  const imports=commands({parseEpubBatch:async()=>{parses++;return [book('new')];}});
  await act(async()=>{await imports.ingest([new File(['n'],'n.pdf')]);});
  assert.equal(writes,0);assert.equal(parses,0);
  await act(async()=>{gate.reject(Error('read transaction failed'));await tick();});
  assert.equal(store.getState().storageReady,false);assert.match(store.getState().storageStatus,/恢复失败/);
  await act(async()=>{await imports.ingest([new File(['n'],'n.pdf')]);store.getState().setSaveRetry(v=>v+1);await tick();});
  assert.equal(writes,0,'failed restoration never writes an empty or new snapshot');assert.equal(parses,0);
  assert.equal(saved.books[0].id,'on-disk');
  console.log('PASS STORE-03: pending/failed restore blocks imports and all persistence writes');
  hook.unmount();
}

async function failedClear() {
  sessionStorage.clear();
  const old=book('retained'), report={records:[{id:'retained',status:'failed'}]};
  let loads=0;
  storage.loadLibrary=async()=>({...snapshot([{...old,coverUrl:'blob:preview-'+(++loads)}]),lastExport:report});
  const gate=deferred(), calls=[], released=[];let failClear=true;
  storage.saveLibrary=async value=>{calls.push(value);if(value.books.length)await gate.promise;else if(failClear)throw Error('deletion transaction failed');};
  assets.revokeCovers=books=>released.push(...books);
  const store=createFolioStore(), {hook,commands}=mount(store);
  await waitFor(()=>assert.equal(store.getState().storageReady,true));
  const retained=store.getState().books[0];
  act(()=>{
    hook.result.current.details.openDetails(hook.result.current.view.viewBooks[0]);
    store.getState().setCheckedIds(new Set(['retained']));
  });
  act(()=>hook.result.current.details.updateDetailDraft('title','Unsaved draft'));
  let clearing;const command=commands();
  act(()=>{clearing=command.clearAll();});
  assert.equal(store.getState().storageReady,false);assert.equal(store.getState().runtime.importingRef.current,true);
  assert.equal(calls.filter(c=>!c.books.length).length,0,'clear waits for queued saves');
  await act(async()=>{gate.resolve();await clearing;await tick();});
  assert.equal(store.getState().books[0],retained);assert.equal(store.getState().exportReport,report);
  assert.equal(store.getState().selectedId,'retained');assert.equal(store.getState().metadataTitleDraft,'Unsaved draft');
  assert.ok(store.getState().checkedIds.has('retained'));
  assert.equal(JSON.parse(sessionStorage.getItem('folio-detail-drafts')).retained.title,'Unsaved draft');
  assert.equal(released.includes(retained),false,'failed clear never revokes the retained previews');
  assert.match(store.getState().error,/清空失败/);assert.equal(store.getState().runtime.importingRef.current,false);
  assert.equal(store.getState().storageReady,true);assert.equal(store.getState().busy,false);
  console.log('PASS STORE-04: failed clear preserves books, receipt, selection, drafts and preview URLs');
  failClear=false;
  await act(async()=>{await command.clearAll();});
  assert.equal(store.getState().books.length,0);assert.equal(store.getState().selectedId,null);
  assert.equal(store.getState().checkedIds.size,0);assert.equal(sessionStorage.getItem('folio-detail-drafts'),null);
  assert.equal(released.filter(b=>b===retained).length,1);assert.equal(store.getState().exportReport,undefined);
  hook.unmount();
}

async function selectorsAndIsolation() {
  const first=createFolioStore(),second=createFolioStore(),selectors=createFolioSelectors();
  first.getState().setBooks([book('one')]);
  first.getState().setBooks(previous=>[...previous,book('two')]);
  first.getState().setBooks(previous=>[...previous,book('three')]);
  assert.equal(first.getState().books.length,3);assert.equal(second.getState().books.length,0);
  assert.notEqual(first.getState().runtime.importingRef,second.getState().runtime.importingRef);
  assert.notEqual(first.getState().checkedIds,second.getState().checkedIds);
  const pipeline=selectors.pipeline(first.getState()),view=selectors.view(first.getState());
  let renders=0;const wrapper=({children})=>React.createElement(FolioStoreProvider,{store:first},children);
  const h=renderHook(()=>{renders++;return useFolioSelector(s=>({books:s.books,setBooks:s.setBooks}));},{wrapper});
  const before=renders,setter=h.result.current.setBooks;
  act(()=>{for(let i=0;i<100;i++)first.getState().setProgress({done:i,total:100,current:'work'});});
  assert.equal(renders,before,'library-only subscribers do not rerender on progress');
  assert.equal(selectors.pipeline(first.getState()),pipeline);assert.equal(selectors.view(first.getState()),view);
  assert.equal(h.result.current.setBooks,setter);
  act(()=>{first.getState().setQuery('Title two');first.getState().setCheckedIds(new Set(['three']));first.getState().setBatchScope('selected');});
  assert.deepEqual(selectors.view(first.getState()).viewBooks.map(b=>b.id),['two']);
  assert.deepEqual(selectors.view(first.getState()).batchBooks.map(b=>b.id),['three']);
  const exported=[], csv=[];
  first.setState({storageReady:true,useOnlineMeta:false,exportScope:'filtered'});
  const command=createWorkbenchCommands(first,()=>({details:{},clearLibrary:async()=>{}}),{
    downloadLibraryZip:async books=>{exported.push(books.map(b=>b.id));return {records:[],failed:0,success:books.length,excluded:0};},
    downloadCsv:books=>csv.push(books.map(b=>b.id)),
  });
  await act(async()=>{await command.handleExport();});assert.deepEqual(exported[0],['two']);
  act(()=>{first.getState().setExportScope('selected');first.getState().setCheckedIds(new Set(['one']));});
  await act(async()=>{await command.handleExport();});assert.deepEqual(exported[1],['one']);
  act(()=>command.exportCsv());assert.deepEqual(csv[0],['one']);
  const receipt=first.getState().exportReport;
  const failing=createWorkbenchCommands(first,()=>({details:{},clearLibrary:async()=>{}}),{downloadLibraryZip:async()=>{throw Error('ZIP failed');}});
  await act(async()=>{await failing.handleExport();});
  assert.equal(first.getState().exportReport,receipt);assert.equal(first.getState().error,'ZIP failed');
  assert.equal(first.getState().exportProgress,null);assert.equal(first.getState().runtime.importingRef.current,false);
  h.unmount();
  console.log('PASS store isolation, functional updates, latest scopes and selective subscriptions (100 progress updates, 0 extra library renders)');
}

(async()=>{
  try {await selectorsAndIsolation();await appendAndCancel();await failedRestore();await failedClear();}
  finally {cleanup();storage.loadLibrary=original.load;storage.saveLibrary=original.save;assets.revokeCovers=original.revoke;dom.window.close();}
})().catch(error=>{console.error(error);process.exit(1);});
