const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {extractPaperMetadata,applyPaperMetadata,pdfHeaderLines}=require('./src/lib/paper-metadata.ts');
const cases=[['hilbert',"Hilbert's sixth problem derivation of fluid equations via Boltzmann's kinetic theory.pdf",['YU DENG','ZAHER HANI','XIAO MA']],['kakeya','Volume estimates for unions of convex sets, and the Kakeya set conjecture in three dimensions.pdf',['Hong Wang','Joshua Zahl']]];
for(const [id,filename,names] of cases){
 const items=JSON.parse(fs.readFileSync('./paper-test-fixtures/'+id+'-items.json','utf8'));
 const meta=extractPaperMetadata(items,filename);assert.ok(meta);assert.deepEqual(meta.authors,names);
 assert.ok(meta.title.length>75);assert.equal(meta.titleEvidence.length,2);
 const book={rawTitle:'',authors:[],identifiers:[]};applyPaperMetadata(book,meta);assert.deepEqual(book.authors,names);assert.equal(book.rawTitle,meta.title);
 const partial={rawTitle:meta.title.slice(0,30),authors:[names[0]],identifiers:[]};applyPaperMetadata(partial,meta);assert.equal(partial.rawTitle,meta.title);assert.deepEqual(partial.authors,names);
 const conflict={rawTitle:'Different book title',authors:['Different Person'],identifiers:[]};applyPaperMetadata(conflict,meta);assert.equal(conflict.rawTitle,'Different book title');assert.deepEqual(conflict.authors,['Different Person']);assert.ok(conflict.warnings.length>=2);
 console.log('PASS',id,JSON.stringify({title:meta.title,authors:meta.authors,arxivId:meta.arxivId}));
 assert.equal(extractPaperMetadata(items.filter(i=>!/^Abstract/.test(i.str||'')),filename),undefined);
}
const item=(str,x,y,height=12,width=str.length*6)=>({str,transform:[height,0,0,height,x,y],height,width});
const ordinary=[item('Some Book',10,700),item('An Author',10,660),item('Chapter One',10,600)];assert.equal(extractPaperMetadata(ordinary,'Some Book.pdf'),undefined);
const rotated={str:'arXiv:2503.01800v1',transform:[0,20,-20,0,20,100],width:300,height:20};assert.ok(!pdfHeaderLines([rotated,...ordinary]).some(l=>l.text.includes('arXiv')));
console.log('PASS multi-line titles, all author columns, metadata completion/conflicts, ordinary books and rotated stamp exclusion');
