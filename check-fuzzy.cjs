const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {runPipeline}=require('./src/lib/pipeline.ts');
const base={kind:'pdf',size:10,status:'ok',identifiers:[],subjects:[],publisher:'',language:'en',description:'',date:'',series:'',spineCount:1,hasZlibTag:false};
const books=[];
for(let i=0;i<18;i++){
 const words=Array.from({length:40},(_,j)=>`topic${i}word${j}`), title=words.join(' ');
 const a={...base,id:`a${i}`,hash:`hash-a${i}`,rawTitle:title,authors:['Ada Author'],originalName:`A${i}.pdf`,relativePath:`A${i}.pdf`};
 const b={...a,id:`b${i}`,hash:`hash-b${i}`,rawTitle:[...words.slice(0,39),'changed'].join(' '),originalName:`B${i}.pdf`,relativePath:`B${i}.pdf`};
 if(i%6===1){a.isbn='978'+String(i*2).padStart(10,'0');b.isbn='978'+String(i*2+1).padStart(10,'0')}
 if(i%6===2){a.series='Series one';b.series='Series two'}
 if(i%6===3){a.rawTitle+=' Vol.1';b.rawTitle+=' Vol.2'}
 if(i%6===4){b.authors=['Other Person']}
 if(i%6===5){b.rawTitle=title+' extra first second'}
 books.push(a,b);
}
const actual=runPipeline(books,1).groups.map(g=>g.bookIds.slice().sort()).sort();
const expected=[['a0','b0'],['a6','b6'],['a12','b12']].sort();
assert.deepEqual(actual,expected);
if(process.argv[2]==='baseline')assert.deepEqual(actual,require('./src/lib/pipeline-baseline.tmp.ts').runPipeline(books,1).groups.map(g=>g.bookIds.slice().sort()).sort());
console.log('PASS fuzzy threshold boundary, author mismatch, distinct ISBN/series/volume, unchanged baseline grouping');
