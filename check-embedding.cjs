const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m,p) => m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {PDFDocument}=require('pdf-lib'), JSZip=require('jszip');
const {DOMParser,XMLSerializer}=require('@xmldom/xmldom'); Object.assign(global,{DOMParser,XMLSerializer});
const {embedCover}=require('./src/lib/embed-cover.ts');
(async()=>{
 const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAICAgICAgICAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCfAAv/2Q==','base64');
 const doc=await PDFDocument.create(); doc.addPage([595,842]).drawText('ORIGINAL BODY');
 const bytes=await doc.save(), file=new Blob([bytes]);
 const book={coverStyleVersion:2,kind:'pdf',file,coverPreference:'title',titleCoverBlob:new Blob([jpeg])};
 const output=await embedCover(book); assert.equal((await PDFDocument.load(output)).getPageCount(),2); assert.deepEqual((await PDFDocument.load(output)).getPage(0).getSize(),{width:595,height:842});
 assert.equal((await PDFDocument.load(await embedCover(book))).getPageCount(),2);
 assert.deepEqual(Buffer.from(await embedCover({...book,coverPreference:'original'})),Buffer.from(bytes));
 assert.deepEqual(Buffer.from(await file.arrayBuffer()),Buffer.from(bytes));

 const zip=new JSZip(); zip.file('mimetype','application/epub+zip');zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
 zip.file('OPS/book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="body" href="body.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="body"/></spine></package>');
 zip.file('OPS/body.xhtml','<html><body>UNTOUCHED BODY</body></html>');
 const epub={...book,kind:'epub',file:new Blob([await zip.generateAsync({type:'uint8array'})])};
 const epubBytes=await embedCover(epub), out=await JSZip.loadAsync(epubBytes);
 assert.equal(await out.file('OPS/body.xhtml').async('string'),'<html><body>UNTOUCHED BODY</body></html>');
 const opf=await out.file('OPS/book.opf').async('string');assert.match(opf,/properties="cover-image"/);assert.match(opf,/<itemref idref="folio-cover-page"\/><itemref idref="body"/);
 assert.equal(Buffer.from(epubBytes).readUInt16LE(8),0);assert.equal(Buffer.from(epubBytes).subarray(30,38).toString(),'mimetype');
 await assert.rejects(()=>embedCover({...book,titleCoverBlob:undefined}),/缺失/);
 zip.file('META-INF/encryption.xml','<encryption/>');const encrypted=new Blob([await zip.generateAsync({type:'uint8array'})]);await assert.rejects(()=>embedCover({...epub,file:encrypted}),/签名或加密/);
 console.log('PASS PDF/EPUB embedding, source preservation, repeated exports, first uncompressed mimetype, cover registration, missing cover and encryption errors');
})().catch(e=>{console.error(e);process.exitCode=1});
