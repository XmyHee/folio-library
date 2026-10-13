const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),JSZip=require('jszip');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {buildLibraryZip}=require('./src/lib/export.ts');
const {createExportPlan,MAX_ZIP_BYTES}=require('./src/lib/export-plan.ts');
const {createImportBatchParser}=require('./src/lib/import-batch.ts');
const {convertMarkdown}=require('./src/lib/markdown/import.ts');
const {defaultMarkdownSettings}=require('./src/lib/markdown/settings.ts');
const base={id:'stable',file:new File(['Original PDF bytes'],'source.pdf'),originalName:'source.pdf',relativePath:'source.pdf',hash:'hash',size:18,kind:'pdf',status:'ok',rawTitle:'Stable',resolvedTitle:'Stable',authors:['Author'],resolvedAuthors:['Author'],identifiers:[],publisher:'',language:'en',description:'',date:'',series:'',subjects:[],proposedName:'Stable - Author.pdf',role:'unique'};
const fakeSized=(size,name='large.pdf')=>{const file=new File(['small fixture'],name);Object.defineProperty(file,'size',{value:size});return file;};
(async()=>{
 let reads=0;const read=base.file.arrayBuffer.bind(base.file);base.file.arrayBuffer=async()=>{reads++;return read();};
 const built=await buildLibraryZip([base],{includeDuplicates:true});assert.equal(reads,1,'unchanged exports read each file once');
 const zip=await JSZip.loadAsync(await built.blob.arrayBuffer());assert.equal(await zip.file('Library/Stable - Author.pdf').async('string'),'Original PDF bytes');assert.equal(built.report.records[0].sourceSha256,built.report.records[0].outputSha256);
 const huge=fakeSized(MAX_ZIP_BYTES+1);huge.arrayBuffer=async()=>{throw Error('must not allocate huge input');};
 const over={...base,id:'over',file:huge,size:huge.size};assert.match(createExportPlan([over],{includeDuplicates:true}).blockers.join(),/256 MiB/);
 await assert.rejects(()=>buildLibraryZip([over],{includeDuplicates:true}),/256 MiB/);
 const missing=createExportPlan([{...base,file:undefined}],{includeDuplicates:true});assert.ok(missing.issues.some(issue=>issue.reasons.includes('原文件不可用')));
 const embed=require('./src/lib/embed-cover.ts'),realEmbed=embed.embedCover;
 const output=new Uint8Array([1]);Object.defineProperty(output,'byteLength',{value:MAX_ZIP_BYTES+1});
 embed.embedCover=async()=>output;
 try {await assert.rejects(()=>buildLibraryZip([base],{includeDuplicates:true}),/256 MiB/,'actual prepared output is bounded too');}
 finally {embed.embedCover=realEmbed;}
 const retainedOriginal={...base,id:'retained',file:fakeSized(140*1024*1024),coverPreference:'title',titleCoverBlob:new Blob(['cover'])};
 assert.match(createExportPlan([retainedOriginal],{includeDuplicates:true}).blockers.join(),/256 MiB/,'original and output both count');
 const mdAssets={...base,id:'md',markdownSource:{file:fakeSized(3,'note.md'),path:'note.md',hash:'md',assets:[{path:'image.png',hash:'img',file:fakeSized(MAX_ZIP_BYTES,'image.png')}],settings:defaultMarkdownSettings,rendererVersion:1,identityVersion:1}};
 assert.match(createExportPlan([mdAssets],{includeDuplicates:true}).blockers.join(),/256 MiB/,'Markdown retained images count');
 let running=0,peak=0;
 const parser=createImportBatchParser({parseBook:async file=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,2));running--;return {...base,id:file.name,file};},addDocumentCover:async b=>b,revokeCovers:()=>{}});
 await parser([fakeSized(33*1024*1024,'a.pdf'),fakeSized(33*1024*1024,'b.pdf')],()=>{},2);assert.equal(peak,1,'large files parse serially');
 peak=0;await parser([fakeSized(1,'a.pdf'),fakeSized(1,'b.pdf')],()=>{},2);assert.equal(peak,2,'small batches retain bounded concurrency');
 const oversizedMd=fakeSized(6*1024*1024,'too-large.md');oversizedMd.arrayBuffer=async()=>{throw Error('must not hash oversized MD');};
 const failed=await convertMarkdown(oversizedMd,[oversizedMd],defaultMarkdownSettings,{parsePdf:async()=>{throw Error('must not render');}});
 assert.match(failed.error,/超过 5 MB/);assert.equal(failed.status,'error');assert.equal(failed.markdownSource.file,oversizedMd);
 console.log('PASS single-read exports, ZIP preflight before allocation, retained originals/images accounting, large-file serial parsing, small-file concurrency and MD size rejection before hashing');
})().catch(error=>{console.error(error);process.exitCode=1});
