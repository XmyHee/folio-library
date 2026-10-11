const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {titleCover,titleCoverForBook}=require('./src/lib/document-cover.ts');
const {PDFDocument}=require('pdf-lib');
(async()=>{
 let texts=[],points=[],size,background;
 global.document={createElement:()=>{const c={width:0,height:0,getContext:()=>({fillRect(...rect){background=rect},fillText:(t,x,y)=>{texts.push(t);points.push([x,y])},measureText:t=>({width:Array.from(t).length*20})}),toBlob:cb=>{size={width:c.width,height:c.height};cb(new Blob(['generated']))}};return c}};
 await titleCover('测试标题','张三','pdf',true);
 assert.deepEqual(texts,['测试标题','张三']);assert.deepEqual(background,[0,0,size.width,size.height]);
 texts=[]; await titleCover('只有标题','Unknown','epub',false);assert.deepEqual(texts,['只有标题']);
 await assert.rejects(()=>titleCover('','Unknown','pdf',true),/没有读取到/);
 texts=[];points=[];const long='无空格中文标题'.repeat(35);await titleCover(long,'张三、李四','pdf',true,undefined,{width:842,height:595});
 assert.equal(texts.slice(0,-1).join(''),long);assert.ok(points.every(([x,y])=>x===600&&y>0&&y<size.height));
 assert.equal(size.height,Math.round(1200*595/842));
 const doc=await PDFDocument.create();doc.addPage([595,842]);
 await titleCoverForBook({kind:'pdf',file:new Blob([await doc.save()])},'标题','作者');assert.equal(size.height,Math.round(1200*842/595));
 console.log('PASS only title/author, no placeholders, full background, complete long title, portrait/landscape fitting, source PDF ratio');
})().catch(e=>{console.error(e);process.exitCode=1});
