const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (module, filename) => {
 const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
 module._compile(output.outputText,filename);
};
async function main() {
 const {detectBookKind}=require('./src/lib/detect.ts');
 const {runPipeline}=require('./src/lib/pipeline.ts');
 const JSZip=require('jszip');
 const pdf=new Blob(['%PDF-1.7\n']);
 assert.equal(await detectBookKind(pdf),'pdf');
 const zip=new JSZip(); zip.file('mimetype','application/epub+zip');zip.file('META-INF/container.xml','<container/>');
 const bytes=await zip.generateAsync({type:'nodebuffer'});
 assert.equal(await detectBookKind(new Blob([bytes])),'epub');
 assert.equal(await detectBookKind(new Blob(['fake.pdf'])),'other');
 const ordinary=new JSZip();ordinary.file('test.txt','test');
 assert.equal(await detectBookKind(new Blob([await ordinary.generateAsync({type:'nodebuffer'})])),'other');
 const book=(id,kind,hash,title='Sample')=>({id,kind,hash,originalName:'sample.'+kind,relativePath:'sample.'+kind,size:10,status:'ok',rawTitle:title,authors:['Author'],publisher:'',language:'',identifiers:[],description:'',date:'',subjects:[],series:'',spineCount:1,hasZlibTag:false});
 const collision=runPipeline([book('a','pdf',''),book('b','pdf','')],1);
 assert.ok(collision.books.every(b=>b.proposedName.endsWith('.pdf')));
 assert.equal(new Set(collision.books.map(b=>b.proposedName)).size,2);
 const partial=runPipeline([book('a','pdf','partial-123','One'),book('b','pdf','partial-123','Two')],1);
 assert.ok(partial.groups.every(g=>g.kind!=='hash'));
 const exact=runPipeline([book('a','pdf','a'.repeat(64)),book('b','pdf','a'.repeat(64))],1);
 assert.equal(exact.groups[0].kind,'hash');
 const mislabeled=runPipeline([{...book('a','pdf',''),originalName:'wrong.epub'}],1);
 assert.ok(mislabeled.books[0].proposedName.endsWith('.pdf'));
 const hit={title:'Online Title',authors:['Online Author'],source:'openlibrary'};
 const online=runPipeline([{...book('a','pdf',''),isbn:'9781234567897'}],1,{}, {online:true,olByIsbn:new Map([['9781234567897',hit]])});
 assert.equal(online.books[0].resolvedTitle,'Online Title');
 console.log('PASS: 10 assertions covering format signatures, ZIP distinction, PDF collision, partial/full hashes, corrected extension and online metadata.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
