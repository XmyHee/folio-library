const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {runPipeline}=require('./src/lib/pipeline.ts');
const {createCoversCommands}=require('./src/commands/covers.ts');
(async()=>{
const file=new Blob(['untouched original']);
const old={id:'stable-id',file,kind:'pdf',originalName:'Paper title.pdf',relativePath:'Paper title.pdf',size:file.size,hash:'source-hash',status:'ok',rawTitle:'',authors:[],identifiers:[],subjects:[],publisher:'',language:'en',description:'',date:'',series:'',spineCount:1,hasZlibTag:false,coverPreference:'title',coverUrl:'old-original',titleCoverUrl:'old-generated',coverTitle:'old title',coverAuthor:'',coverlessConfirmed:true};
let state=[old],selected=runPipeline(state,1,{}, {online:false}).books[0],error=null,titleDraft,authorDraft,busy=false;const revoked=[];const lock={current:false};
let parsed={...old,id:'temporary-id',rawTitle:'Paper title',authors:['First Author','Second Author'],coverUrl:'new-original',coverBlob:new Blob(['original preview']),titleCoverUrl:undefined,paperMetadata:{title:'Paper title',authors:['First Author','Second Author'],titleEvidence:['Paper title'],authorEvidence:['First Author; Second Author']}};
const dependencies={importingRef:lock,storageReady:true,setBusy:v=>busy=v,setError:v=>error=v,parseBook:async()=>parsed,books:state,namingMode:1,keepOverrides:{},olByIsbn:new Map(),useOnlineMeta:false,runPipeline,refreshTitleCover:async()=>new Blob(['new generated']),setBooks:f=>state=f(state),setSelected:f=>selected=f(selected),setCoverTitleDraft:v=>titleDraft=v,setCoverAuthorDraft:v=>authorDraft=v,URL:{createObjectURL:()=> 'new-generated',revokeObjectURL:u=>revoked.push(u)}};
const reidentify=createCoversCommands(()=>({...dependencies,books:state})).regenerateDocumentCover;
await reidentify(selected);
assert.equal(state[0].id,old.id);assert.equal(state[0].file,file);assert.equal(state[0].hash,old.hash);assert.deepEqual(state[0].authors,['First Author','Second Author']);assert.equal(state[0].coverAuthor,undefined);assert.equal(state[0].coverPreference,'title');assert.equal(state[0].coverlessConfirmed,true);
assert.ok(!selected.proposedName.includes('Unknown'));assert.ok(authorDraft.includes('Second Author'));assert.equal(titleDraft,'Paper title');assert.deepEqual(revoked,['old-original','old-generated']);assert.equal(error,null);assert.equal(busy,false);assert.equal(lock.current,false);
const preserved=state[0];parsed={...parsed,status:'error',error:'test read failure',coverUrl:'failed-preview'};await reidentify(selected);
assert.equal(state[0],preserved);assert.ok(error.includes('test read failure'));assert.ok(revoked.includes('failed-preview'));assert.ok(!revoked.includes('new-original'));
console.log('PASS actual re-identify action: updated catalog/naming/cover, preserved ID/source/hash, reset cover drafts, failure preservation and URL cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
