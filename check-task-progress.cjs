const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'https://folio.test/'});
for (const name of ['window','document','HTMLElement']) global[name] = dom.window[name];
global.IS_REACT_ACT_ENVIRONMENT = true;
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
}).outputText, filename);
const React = require('react');
const {render, cleanup, fireEvent} = require('@testing-library/react');
const {TaskProgress} = require('./src/components/TaskProgress.tsx');
const {createImportBatchParser} = require('./src/lib/import-batch.ts');
const {convertMarkdown,defaultMarkdownSettings} = require('./src/lib/markdown/import.ts');
const base = {busy:false,exporting:false,progress:null,exportProgress:null,olProgress:null,coverBatchRunning:false};
(async()=>{
  const ui = render(React.createElement(TaskProgress,base));
  assert.equal(ui.queryByRole('progressbar'),null);
  ui.rerender(React.createElement(TaskProgress,{...base,busy:true,progress:{done:0,total:1,current:'large.pdf'}}));
  assert.equal(ui.getByRole('progressbar').getAttribute('aria-valuenow'),'0');
  assert.match(ui.container.textContent,/大文件可能需要较长时间/);
  ui.rerender(React.createElement(TaskProgress,{...base,busy:true,progress:{done:1,total:3,current:'生成 PDF：notes.md'}}));
  assert.match(ui.container.textContent,/MD 转 PDF/);
  assert.equal(ui.getByRole('progressbar').getAttribute('aria-valuenow'),'1');
  ui.rerender(React.createElement(TaskProgress,{...base,busy:true,olProgress:'书目查询 0/1',progress:{done:3,total:3,current:'notes.md'}}));
  assert.equal(ui.getByRole('progressbar').hasAttribute('aria-valuenow'),false,'lookup does not show stale import 100%');
  ui.rerender(React.createElement(TaskProgress,{...base,exporting:true,exportProgress:{done:2,total:4,current:'book.pdf'}}));
  assert.match(ui.container.textContent,/准备导出文件/);
  assert.equal(ui.getByRole('progressbar').getAttribute('aria-valuenow'),'2');
  ui.rerender(React.createElement(TaskProgress,{...base,exporting:true,exportProgress:{done:4,total:4,current:'生成 ZIP',zipPercent:37}}));
  assert.equal(ui.getByRole('progressbar').getAttribute('aria-valuenow'),'37');
  assert.equal(ui.getByRole('progressbar').getAttribute('aria-valuemax'),'100');
  ui.rerender(React.createElement(TaskProgress,base));
  assert.equal(ui.queryByRole('progressbar'),null,'success, failure and cancellation all hide inactive feedback');
  cleanup();
  const {RulesContainer} = require('./src/containers/RulesContainer.tsx');
  const {LibraryContainer} = require('./src/containers/LibraryContainer.tsx');
  const {useLibraryView} = require('./src/hooks/useLibraryView.ts');
  const {runPipeline} = require('./src/lib/pipeline.ts');
  let mode=1, exports=0;
  const rules=render(React.createElement(RulesContainer,{bookCount:1,namingMode:1,setNamingMode:v=>mode=v,
    useOnlineMeta:false,setUseOnlineMeta:()=>{},busy:false,exporting:false,storageReady:true,csvDownloading:false,
    retryCatalog:async()=>{},onClear:()=>{}}));
  fireEvent.click(rules.getByRole('button',{name:'附丛书名'})); assert.equal(mode,2);
  assert.equal(rules.queryByRole('button',{name:'导出 CSV',exact:true}),null);
  assert.ok(rules.getByRole('button',{name:'清空本地书库'}));
  cleanup();
  const {ImportArea}=require('./src/components/ImportArea.tsx');
  let files=0,folders=0,reviews=0;
  const topProps={bookCount:1,busy:false,exporting:false,storageReady:true,coverBatchRunning:false,canCancel:false,
    storageStatus:'已保存',csvDownloading:false,fileRef:{current:{click:()=>files++}},folderRef:{current:{click:()=>folders++}},
    onCancel:()=>{},onRetrySave:()=>{},exportCsv:()=>exports++,onReviewExport:()=>reviews++,ingest:async()=>{}};
  const top=render(React.createElement(ImportArea,topProps));
  const {within}=require('@testing-library/react');
  assert.equal(within(top.getByRole('navigation',{name:'书库操作'})).queryByRole('button',{name:'添加书籍'}),null);
  assert.equal(top.getAllByRole('button',{name:'添加书籍',exact:true}).length,1);
  // Mounted hidden inputs own their refs; inspect the real chooser click rather than bypassing them.
  topProps.fileRef.current.click=()=>files++; topProps.folderRef.current.click=()=>folders++;
  fireEvent.click(top.getByRole('button',{name:'添加书籍',exact:true}));assert.equal(files,1);
  fireEvent.click(top.getByRole('button',{name:'添加文件夹',exact:true}));assert.equal(folders,1);
  fireEvent.click(top.getByRole('button',{name:'导出 CSV',exact:true}));assert.equal(exports,1);
  fireEvent.click(top.getByRole('button',{name:'检查并导出书库与笔记'}));assert.equal(reviews,1);
  assert.equal(top.queryByRole('button',{name:'选择书籍文件'}),null);
  assert.equal(top.queryByRole('button',{name:'选择文件夹'}),null);
  top.rerender(React.createElement(ImportArea,{...topProps,busy:true}));
  assert.equal(top.getByRole('button',{name:'导出 CSV',exact:true}).disabled,true);
  assert.equal(top.getByRole('button',{name:'添加书籍',exact:true}).disabled,true);
  top.rerender(React.createElement(ImportArea,{...topProps,bookCount:0}));
  assert.equal(top.getByRole('button',{name:'检查并导出书库与笔记'}).disabled,true);
  cleanup();
  const input={id:'one',file:new File(['pdf'],'One.pdf'),originalName:'One.pdf',relativePath:'One.pdf',size:3,
    hash:'one',status:'ok',kind:'pdf',rawTitle:'One',authors:['Author'],publisher:'',language:'en',identifiers:[],description:'',date:'',subjects:[],series:'',spineCount:1,hasZlibTag:false};
  const pipeline=runPipeline([input],1,{}, {online:false}); let opened='';
  function Harness(){const view=useLibraryView(pipeline);return React.createElement(LibraryContainer,{view,pipeline,
    busy:false,exporting:false,storageReady:true,coverBatchRunning:false,coverBatchResult:null,showCoverBatchReview:false,
    setShowCoverBatchReview:()=>{},cancelCovers:()=>{},generateMissingCovers:async()=>{},openDetails:b=>opened=b.id,setKeepOverrides:()=>{}});}
  const library=render(React.createElement(Harness));
  fireEvent.click(library.getByRole('button',{name:'选择全库（1）'}));
  assert.ok(library.getAllByRole('checkbox',{name:'选择 One.pdf'}).every(box=>box.checked));
  fireEvent.click(library.getAllByRole('button',{name:/One.*Author/})[0]); assert.equal(opened,'one');
  fireEvent.change(library.getByRole('searchbox',{name:'搜索书库'}),{target:{value:'missing'}});
  assert.equal(library.queryAllByRole('checkbox',{name:'选择 One.pdf'}).length,0);
  cleanup();
  const file = new File(['# Test\n\nBody'],'notes.md'), events=[], stages=[];
  const parsed = {id:'test',file,status:'ok',authors:[],identifiers:[],warnings:[]};
  const services = {parseBook:async()=>parsed,addDocumentCover:async b=>b,revokeCovers:()=>{},
    convertMarkdown:async(f,files,settings,s,signal,onStage)=>{
      onStage('生成 PDF'); return parsed;
    }};
  await createImportBatchParser(services)([file],(done,total,current)=>events.push({done,total,current}));
  assert.deepEqual(events.find(e=>e.current==='生成 PDF：notes.md'),{done:0,total:1,current:'生成 PDF：notes.md'});
  assert.equal(events.at(-1).done,1);
  const actual=await convertMarkdown(file,[file],defaultMarkdownSettings,{parsePdf:async()=>parsed,render:async()=>new Blob(['pdf'])},undefined,s=>stages.push(s));
  assert.equal(actual.status,'ok');
  assert.deepEqual(stages,['读取 Markdown','准备排版与图片','生成 PDF','读取生成的 PDF']);
  console.log('PASS task feedback stages, file/ZIP measurements, unknown progress, idle cleanup and Markdown stage propagation');
})().catch(error=>{console.error(error);process.exit(1);});
