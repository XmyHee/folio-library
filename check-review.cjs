const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require('fake-indexeddb/auto');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {reviewReasons,reviewKey,isReviewed,needsReview}=require('./src/lib/review.ts'),{saveLibrary,loadLibrary}=require('./src/lib/storage.ts');
(async()=>{
const book={id:'paper',hash:'original',file:new Blob(['source']),originalName:'1709.01412v2 - Unknown.pdf',rawTitle:'1709.01412v2',resolvedTitle:'1709.01412v2',authors:[],resolvedAuthors:[],metaSource:'filename',status:'ok',warnings:['首页与内置书目不同']};
assert.deepEqual(reviewReasons(book),['书名仍为论文编号','缺少作者','识别信息冲突']);assert.equal(needsReview(book),true);
const confirmed={...book,reviewedMetadataKey:reviewKey(book)};assert.equal(isReviewed(confirmed),true);assert.equal(needsReview(confirmed),false);assert.equal(reviewReasons(confirmed).length,3);
assert.equal(needsReview({...confirmed,resolvedTitle:'Changed title'}),true);assert.equal(needsReview({...confirmed,status:'error',error:'broken'}),true);
const fixed={...book,manualMetadata:{title:'Actual title',authors:['Actual Author']},resolvedTitle:'Actual title',resolvedAuthors:['Actual Author'],metaSource:'manual'};assert.deepEqual(reviewReasons(fixed),[]);assert.equal(isReviewed(fixed),false);
await saveLibrary({version:1,books:[confirmed],namingMode:1,keepOverrides:{},olByIsbn:new Map(),useOnlineMeta:false,includeDuplicates:true});const loaded=await loadLibrary();assert.equal(isReviewed(loaded.books[0]),true);assert.equal(await loaded.books[0].file.text(),'source');
assert.equal(isReviewed({...confirmed,reviewedMetadataKey:undefined}),false);
console.log('PASS review reasons, explicit confirmation, preserved unresolved issues, metadata/error invalidation, manual conflict resolution, undo and persistence');
})().catch(e=>{console.error(e);process.exitCode=1});
