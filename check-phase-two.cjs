const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><h2 id="detail-title" tabindex="-1"></h2></body></html>', {url:'https://folio.test/'});
for (const name of ['window','document','HTMLElement','sessionStorage','Event','BeforeUnloadEvent']) global[name] = dom.window[name];
global.IS_REACT_ACT_ENVIRONMENT = true;
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText, filename);
const {renderHook, render, act, waitFor, cleanup} = require('@testing-library/react');
require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const React = require('react');
const {useLibraryState} = require('./src/hooks/useLibraryState.ts');
const {useBookDetails} = require('./src/hooks/useBookDetails.ts');
const {useTaskState} = require('./src/hooks/useTaskState.ts');
const {useLibraryView} = require('./src/hooks/useLibraryView.ts');
const {useFileIntake} = require('./src/hooks/useFileIntake.ts');
const storage = require('./src/lib/storage.ts');
const parser = require('./src/lib/book-assets.ts');
const {runPipeline} = require('./src/lib/pipeline.ts');
const original = {load:storage.loadLibrary, save:storage.saveLibrary, revoke:parser.revokeCovers};
const deferred = () => {let resolve,reject;const promise = new Promise((yes,no) => {resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick = () => new Promise(resolve => setTimeout(resolve,0));
const book = (id,title='书籍 '+id) => ({id,file:new File(['source '+id],title+'.pdf'),originalName:title+'.pdf',relativePath:title+'.pdf',size:12,hash:id,
  status:'ok',rawTitle:title,authors:['作者'],publisher:'',language:'zh',identifiers:[],description:'',date:'',subjects:[],series:'',spineCount:1,hasZlibTag:false,kind:'pdf'});
const snapshot = (books) => ({version:1,books,namingMode:1,keepOverrides:{},olByIsbn:new Map(),useOnlineMeta:false,includeDuplicates:true,
  exportSettings:{noteTemplate:'{{TITLE}}',includeNotes:false}});
const derive = books => runPipeline(books,1,{}, {online:false}).books;

async function persistence() {
  const loading = deferred(), saves=[];
  storage.loadLibrary = () => loading.promise;
  storage.saveLibrary = async value => {saves.push(value);};
  let h=renderHook(({busy})=>useLibraryState(busy),{initialProps:{busy:false}});
  assert.equal(h.result.current.storageReady,false);
  assert.equal(saves.length,0,'never writes the initial empty state before restoration');
  await act(async()=>{loading.resolve(snapshot([book('old')]));await tick();});
  await waitFor(()=>assert.match(h.result.current.storageStatus,/已保存/));
  assert.deepEqual(saves[0].books.map(b=>b.id),['old']);
  h.rerender({busy:true});
  const before=saves.length;
  act(()=>h.result.current.setBooks(items=>[...items,book('new')]));
  await act(tick);
  assert.equal(saves.length,before,'no persistence during a partial import');
  h.rerender({busy:false});
  await waitFor(()=>assert.equal(saves.length,before+1));
  assert.deepEqual(saves.at(-1).books.map(b=>b.id),['old','new']);
  const oldTemplate = h.result.current.noteTemplate;
  act(()=>h.result.current.setNoteTemplate('修改后的 {{TITLE}}'));
  assert.match(h.result.current.storageStatus,/待保存/);
  assert.equal(saves.at(-1).exportSettings.noteTemplate,oldTemplate);
  await waitFor(()=>assert.equal(saves.at(-1).exportSettings.noteTemplate,'修改后的 {{TITLE}}'));
  h.unmount();

  const first=deferred(); let running=0,peak=0,calls=0;
  storage.loadLibrary=async()=>snapshot([]);
  storage.saveLibrary=async value=>{calls++;running++;peak=Math.max(peak,running);try {if(calls===1) await first.promise;saves.push(value);} finally {running--;}};
  h=renderHook(()=>useLibraryState(false));
  await waitFor(()=>assert.equal(calls,1));
  act(()=>h.result.current.setBooks([book('queued')]));
  await act(tick);assert.equal(calls,1,'second transaction waits for the first');
  await act(async()=>{first.resolve();await tick();});
  await waitFor(()=>assert.equal(calls,2));assert.equal(peak,1);
  let fail=true;
  storage.saveLibrary=async value=>{if(fail) throw Error('quota test');saves.push(value);};
  act(()=>h.result.current.setBooks([book('retained')]));
  await waitFor(()=>assert.match(h.result.current.storageStatus,/保存失败/));
  assert.equal(h.result.current.books[0].id,'retained');
  fail=false;act(()=>h.result.current.setSaveRetry(v=>v+1));
  await waitFor(()=>assert.match(h.result.current.storageStatus,/已保存/));
  assert.equal(saves.at(-1).books[0].id,'retained');h.unmount();

  let writes=0;storage.saveLibrary=async()=>{writes++;};
  storage.loadLibrary=async()=>{throw Error('unreadable database');};
  h=renderHook(()=>useLibraryState(false));
  await waitFor(()=>assert.match(h.result.current.storageStatus,/恢复失败/));
  assert.equal(h.result.current.storageReady,false);assert.equal(writes,0);h.unmount();
  const abandoned=deferred(),released=[];
  storage.loadLibrary=()=>abandoned.promise;parser.revokeCovers=books=>released.push(...books.map(b=>b.id));
  h=renderHook(()=>useLibraryState(false));h.unmount();
  await act(async()=>{abandoned.resolve({...snapshot([book('abandoned')]),clearedLibrary:{books:[book('undo-abandoned')]}});await tick();});
  assert.deepEqual(released,['abandoned']);assert.equal(writes,0);
  // Clear waits behind earlier saves; no previews or active books disappear before commit.
  const clearGate=deferred();let clearCalls=0;
  storage.loadLibrary=async()=>snapshot([book('clear-target')]);
  storage.saveLibrary=async value=>{clearCalls++;if(clearCalls===1)await clearGate.promise;saves.push(value);};
  h=renderHook(()=>useLibraryState(false));await waitFor(()=>assert.equal(clearCalls,1));
  let clearing;
  act(()=>{clearing=h.result.current.clearLibrary();});
  await act(tick);assert.equal(h.result.current.storageReady,false);assert.equal(clearCalls,1);assert.equal(h.result.current.books.length,1);
  assert.equal(released.includes('clear-target'),false);
  await act(async()=>{clearGate.resolve();await clearing;await tick();});
  assert.equal(h.result.current.books.length,0);assert.ok(released.includes('clear-target'));
  assert.equal(saves.at(-1).books.length,0);assert.equal(saves.at(-1).clearedLibrary,undefined);h.unmount();
  storage.loadLibrary=async()=>snapshot([book('retain-after-failure')]);storage.saveLibrary=async()=>{};
  h=renderHook(()=>useLibraryState(false));await waitFor(()=>assert.match(h.result.current.storageStatus,/已保存/));
  storage.saveLibrary=async()=>{throw Error('clear quota failure');};
  await act(async()=>{await assert.rejects(h.result.current.clearLibrary(),/quota/);});
  assert.equal(h.result.current.books[0].id,'retain-after-failure');assert.equal(released.includes('retain-after-failure'),false);assert.equal(h.result.current.storageReady,true);h.unmount();

}

async function details() {
  sessionStorage.clear();let errors=[];let books=derive([book('a'),book('b')]);
  let h=renderHook(({books,busy=false})=>useBookDetails(books,busy,false,message=>errors.push(message)),{initialProps:{books}});
  act(()=>h.result.current.openDetails(books[0]));
  assert.equal(h.result.current.metadataTitleDraft,books[0].resolvedTitle);
  assert.equal(document.activeElement.id,'detail-title');
  act(()=>h.result.current.updateDetailDraft('title','未保存的标题'));
  assert.equal(h.result.current.draftDirty,true);
  assert.equal(JSON.parse(sessionStorage.getItem('folio-detail-drafts')).a.title,'未保存的标题');
  const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
  act(()=>h.result.current.openDetails(books[1]));assert.equal(h.result.current.showDraftPrompt,true);assert.equal(h.result.current.selected.id,'a');
  books=derive([book('a'),book('b','更新后的书名')]);h.rerender({books});
  act(()=>h.result.current.finishDetail());
  assert.equal(h.result.current.selected.resolvedTitle,'更新后的书名','pending navigation resolves the current book by ID');
  act(()=>h.result.current.openDetails(books[0]));assert.equal(h.result.current.metadataTitleDraft,'未保存的标题');
  act(()=>h.result.current.closeDetails());assert.equal(h.result.current.showDraftPrompt,true);
  act(()=>{h.result.current.persistDraft(h.result.current.selected);h.result.current.finishDetail();});
  assert.equal(h.result.current.selected,null);assert.equal(sessionStorage.getItem('folio-detail-drafts'),'{}');
  act(()=>h.result.current.openDetails(books[1]));
  books=derive([book('a'),book('b','当前书库的新标题')]);h.rerender({books});
  assert.equal(h.result.current.selected,books[1]);assert.equal(h.result.current.metadataTitleDraft,'当前书库的新标题');
  h.rerender({books,busy:true});act(()=>h.result.current.closeDetails());assert.equal(h.result.current.selected.id,'b');
  h.rerender({books:[],busy:false});assert.equal(h.result.current.selected,null);h.unmount();
  sessionStorage.setItem('folio-detail-drafts','not JSON');
  h=renderHook(()=>useBookDetails(books,false,false,message=>errors.push(message)),{reactStrictMode:true});
  act(()=>h.result.current.openDetails(books[0]));assert.equal(h.result.current.metadataTitleDraft,books[0].resolvedTitle);
  act(()=>h.result.current.updateDetailDraft('authors','草稿作者'));h.unmount();
  h=renderHook(()=>useBookDetails(books,false,false,message=>errors.push(message)));
  act(()=>h.result.current.openDetails(books[0]));assert.equal(h.result.current.metadataAuthorsDraft,'草稿作者');
  h.unmount();assert.equal(errors.length,0);
  const cleanEvent=new Event('beforeunload',{cancelable:true});window.dispatchEvent(cleanEvent);assert.equal(cleanEvent.defaultPrevented,false);
}

async function tasksAndViews() {
  let h=renderHook(()=>useTaskState());
  const controller=new AbortController();h.result.current.taskController.current=controller;h.result.current.importingRef.current=true;
  act(()=>h.result.current.cancelTask());assert.equal(controller.signal.aborted,true);assert.equal(h.result.current.importingRef.current,true,'cancel does not unlock an unfinished operation');
  act(()=>h.result.current.cancelCovers());assert.equal(h.result.current.cancelCoverBatch.current,true);
  const unmounted=new AbortController();h.result.current.taskController.current=unmounted;h.unmount();assert.equal(unmounted.signal.aborted,true);
  const pipeline=runPipeline(Array.from({length:45},(_,i)=>book(String(i))),1,{}, {online:false});
  h=renderHook(({pipeline})=>useLibraryView(pipeline),{initialProps:{pipeline}});
  assert.equal(h.result.current.pageBooks.length,40);
  act(()=>{h.result.current.toggleBook('0');h.result.current.setPage(2);});
  assert.equal(h.result.current.pageBooks.length,5);assert.ok(h.result.current.checkedIds.has('0'));
  act(()=>h.result.current.setQuery('书籍 44'));assert.equal(h.result.current.currentPage,1);assert.equal(h.result.current.viewBooks.length,1);
  act(()=>h.result.current.setBatchScope('selected'));assert.equal(h.result.current.batchBooks[0].id,'0');
  const reduced=runPipeline([book('44')],1,{}, {online:false});h.rerender({pipeline:reduced});assert.equal(h.result.current.checkedIds.size,0);h.unmount();
}

async function intake() {
  const locked={current:false},old=[],latest=[];
  const originalFiles=require('./src/lib/files.ts').filesFromDataTransfer;
  const waiting=deferred();require('./src/lib/files.ts').filesFromDataTransfer=()=>waiting.promise;
  const errors=[];
  const h=renderHook(({onFiles})=>useFileIntake(true,locked,onFiles,message=>errors.push(message)),{initialProps:{onFiles:async files=>old.push(files)}});
  const drag=new Event('dragenter',{cancelable:true});Object.defineProperty(drag,'dataTransfer',{value:{types:['Files']}});
  act(()=>window.dispatchEvent(drag));assert.equal(h.result.current.over,true);
  const drop=new Event('drop',{cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{types:['Files']}});
  act(()=>window.dispatchEvent(drop));assert.equal(h.result.current.over,false);
  h.rerender({onFiles:async files=>latest.push(files)});
  await act(async()=>{waiting.resolve([book('drop').file]);await tick();});assert.equal(old.length,0);assert.equal(latest.length,1);
  locked.current=true;act(()=>window.dispatchEvent(drag));assert.equal(h.result.current.over,false);
  locked.current=false;
  const abandoned=deferred();require('./src/lib/files.ts').filesFromDataTransfer=()=>abandoned.promise;
  act(()=>window.dispatchEvent(drop));h.unmount();
  await act(async()=>{abandoned.resolve([book('abandoned-drop').file]);await tick();});
  assert.equal(latest.length,1,'a directory read cannot start an import after unmount');
  require('./src/lib/files.ts').filesFromDataTransfer=originalFiles;assert.equal(errors.length,0);
}

(async()=>{
  await persistence();await details();
  const drafts=renderHook(()=>useBookDetails(derive([book("clear-draft")]),false,false,()=>{}));
  act(()=>drafts.result.current.openDetails(derive([book("clear-draft")])[0]));
  act(()=>drafts.result.current.updateDetailDraft("title","Retained draft"));
  assert.ok(sessionStorage.getItem("folio-detail-drafts"));
  act(()=>drafts.result.current.clearDetailDrafts());
  assert.equal(sessionStorage.getItem("folio-detail-drafts"),null);assert.equal(drafts.result.current.selected,null);assert.equal(drafts.result.current.draftDirty,false);drafts.unmount();
  const {AppErrorBoundary}=require('./src/components/AppErrorBoundary.tsx');
  function BrokenView(){throw Error('synthetic render failure');}
  const fallback=render(React.createElement(AppErrorBoundary,null,React.createElement(BrokenView)),{onCaughtError:()=>{}});
  assert.match(fallback.getByRole('alert').textContent,/已保存的书库/);assert.ok(fallback.getByRole('button',{name:'重新加载页面'}));fallback.unmount();
  await tasksAndViews();await intake();
  console.log('PASS actual React hook lifecycles: restoration gate/failure, serialized writes/retry/debounce, abandoned load URL cleanup, permanent clear queue/failure, current/pending IDs, drafts/remount/StrictMode, dirty navigation/unload cleanup, cancellation without unlock, selection/pagination and fresh drop handlers');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  cleanup();storage.loadLibrary=original.load;storage.saveLibrary=original.save;parser.revokeCovers=original.revoke;dom.window.close();
});
