const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require('fake-indexeddb/auto');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {runPipeline}=require('./src/lib/pipeline.ts'),{loadLibrary,saveLibrary}=require('./src/lib/storage.ts');
const {savedDetailDraft,detailDraftChanged}=require('./src/lib/detail-draft.ts');
const {createMetadataCommands}=require('./src/commands/metadata.ts');
(async()=>{
let books=[{id:'stable',file:new Blob(['original']),originalName:'1709.01412v2 - Unknown.pdf',relativePath:'1709.01412v2 - Unknown.pdf',hash:'source',size:8,kind:'pdf',status:'ok',rawTitle:'',authors:[],identifiers:[],subjects:[],publisher:'',language:'en',description:'',date:'',series:'',spineCount:1,hasZlibTag:false,isbn:'9781234567890'}],selected,error,titleDraft,authorDraft,persistedDraft;
const options={online:true,olByIsbn:new Map([['9781234567890',{title:'Online title',authors:['Online Author']} ]])};
function action(title,authors,reset=false){const current=runPipeline(books,1,{},options).books[0], saved=savedDetailDraft(current);const deps={savedDetailDraft,persistDraft:(book,draft)=>persistedDraft=draft,coverTitleDraft:saved.coverTitle,coverAuthorDraft:saved.coverAuthor,metadataDirty:false,busy:false,exporting:false,storageReady:true,metadataTitleDraft:title,metadataAuthorsDraft:authors,books,namingMode:1,keepOverrides:{},useOnlineMeta:true,olByIsbn:options.olByIsbn,runPipeline,setError:v=>error=v,setBooks:v=>books=v,setSelected:v=>selected=v,setMetadataTitleDraft:()=>{},setMetadataAuthorsDraft:()=>{},setCoverTitleDraft:v=>titleDraft=v,setCoverAuthorDraft:v=>authorDraft=v};createMetadataCommands(()=>deps).saveReviewedMetadata(current,reset);}
action('Reviewed title','First Author\nSecond Author');
assert.equal(selected.metaSource,'manual');assert.equal(selected.proposedName,'Reviewed title - First Author & Second Author.pdf');assert.equal(books[0].rawTitle,'');assert.deepEqual(books[0].authors,[]);assert.equal(books[0].originalName,'1709.01412v2 - Unknown.pdf');assert.equal(detailDraftChanged(selected,persistedDraft),false);assert.equal(titleDraft,'Reviewed title');assert.equal(authorDraft,savedDetailDraft(selected).coverAuthor);
action('','');assert.ok(error);assert.equal(books[0].manualMetadata.title,'Reviewed title');
await saveLibrary({version:1,books,namingMode:1,keepOverrides:{},olByIsbn:options.olByIsbn,useOnlineMeta:true,includeDuplicates:true});const loaded=await loadLibrary();assert.deepEqual(loaded.books[0].manualMetadata,books[0].manualMetadata);assert.equal(await loaded.books[0].file.text(),'original');
action('Reviewed title','');assert.deepEqual(selected.resolvedAuthors,[]);
action('','',true);assert.equal(books[0].manualMetadata,undefined);assert.equal(selected.resolvedTitle,'Online title');
console.log('PASS actual save/reset action, online override priority, multi-author naming, blank-title rejection, optional authors, original preservation, cover drafts and persistent manual metadata');
})().catch(e=>{console.error(e);process.exitCode=1});
