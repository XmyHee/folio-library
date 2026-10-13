import type { ParsedBook } from "../types";
import { MarkdownAssets, checkCancelled, sha256, sourcePath } from "./assets";
import { readMarkdown, defaultMarkdownSettings, type MarkdownSettings, type MarkdownDocument } from "./model";
import { buildMarkdownDefinition } from "./definition";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

export type MarkdownImportServices = {
  parsePdf: (file: File) => Promise<ParsedBook>;
  render?: (definition:TDocumentDefinitions,doc:MarkdownDocument,signal?:AbortSignal) => Promise<Blob>;
};
export const isMarkdown = (file:File) => /\.(?:md|markdown)$/i.test(file.name);
export const isMarkdownAsset = (file:File) => /\.(?:png|jpe?g|gif|webp|svg|avif|css)$/i.test(file.name);

export async function convertMarkdown(file:File, files:File[], settings:MarkdownSettings, services:MarkdownImportServices, signal?:AbortSignal,onStage?:(stage:string)=>void):Promise<ParsedBook>{
  checkCancelled(signal);
  onStage?.("读取 Markdown");
  // Reject oversized input before allocating a full-file hash buffer.
  const sourceHash=file.size<=5*1024*1024?await sha256(file):"",path=sourcePath(file);
  const assets=new MarkdownAssets(file,files,signal);
  let parsed:ParsedBook|undefined;
  const base:ParsedBook={id:crypto.randomUUID(),file,originalName:file.name,relativePath:path,size:file.size,hash:sourceHash,
    status:"error",kind:"pdf",rawTitle:"",authors:[],publisher:"",language:"",identifiers:[],description:"",date:"",subjects:[],series:"",spineCount:0,hasZlibTag:false,
    markdownSource:{file,path,hash:sourceHash,identityVersion:1,assets:[],settings,rendererVersion:1}};
  try {
    if(file.size>5*1024*1024)throw new Error("Markdown 超过 5 MB，请拆分文档后重试");
    const text=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());
    const doc=readMarkdown(text,file.name,settings);
    Object.assign(base,{rawTitle:doc.title,authors:doc.authors,publisher:doc.publisher,language:doc.language,date:doc.date,description:doc.description,subjects:doc.subjects,identifiers:doc.isbn?[doc.isbn]:[],isbn:doc.isbn||undefined});
    base.markdownSource!.settings=doc.settings;
    onStage?.("准备排版与图片");
    const {definition,warnings}=await buildMarkdownDefinition(doc,href=>assets.image(href),signal);
    checkCancelled(signal);
    const render=services.render ?? (await import("./render")).renderMarkdownPdf;
    onStage?.("生成 PDF");
    const pdf=await render(definition,doc,signal);checkCancelled(signal);
    const generated=new File([pdf],file.name.replace(/\.(?:md|markdown)$/i,".pdf"),{type:"application/pdf",lastModified:0});
    onStage?.("读取生成的 PDF");
    parsed=await services.parsePdf(generated);checkCancelled(signal);
    if(parsed.status!=="ok")throw new Error(parsed.error||"生成的 PDF 无法读取");
    // Identity is versioned source bytes plus sorted referenced assets, never renderer timestamps or PDF bytes.
    const used=[...assets.used.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
    const directory=path.split("/").slice(0,-1);
    const logicalPath=(assetPath:string)=>{const parts=assetPath.split("/");let common=0;while(common<directory.length&&parts[common]===directory[common])common++;return [...directory.slice(common).map(()=>".."),...parts.slice(common)].join("/");};
    const manifest=used.map(asset=>[logicalPath(asset.path),asset.hash]).sort((a,b)=>a[0]!<b[0]!?-1:a[0]!>b[0]!?1:0);
    const hash=await sha256(new Blob([JSON.stringify(["folio-md-source-v1",sourceHash,manifest])]));
    return {...parsed,...base,file:generated,size:generated.size,hash,status:"ok",error:undefined,
      coverBlob:parsed.coverBlob,coverUrl:parsed.coverUrl,coverIsFirstPage:true,coverPreference:"original",spineCount:parsed.spineCount,
      pdfEmbeddedTitle:doc.title,pdfEmbeddedAuthors:doc.authors,paperMetadata:undefined,bookPageMetadata:undefined,paperReasons:[],
      warnings:[...warnings,...(parsed.warnings??[]).filter(warning=>/^(?:PDF 首页生成失败|PDF 元数据读取失败|第 \d+ 页文字读取失败)/.test(warning))],
      markdownSource:{...base.markdownSource!,assets:used}};
  }catch(error){
    if(parsed?.coverUrl)URL.revokeObjectURL(parsed.coverUrl);
    if(parsed?.titleCoverUrl)URL.revokeObjectURL(parsed.titleCoverUrl);
    if(signal?.aborted || error instanceof DOMException && error.name==="AbortError")throw error;
    return {...base,error:"MD 转 PDF 失败："+(error instanceof Error?error.message:String(error)),markdownSource:{...base.markdownSource!,assets:[...assets.used.values()]}};
  }
}

/** Rehydrate paths lost by IndexedDB's File structured clone, retaining source bytes and prior settings. */
export async function reconvertMarkdown(book:ParsedBook,parsePdf:MarkdownImportServices["parsePdf"],signal?:AbortSignal,settings?:MarkdownSettings){
  const source=book.markdownSource;
  if(!source)throw new Error("缺少 Markdown 原始文件");
  const restore=(file:File,path:string)=>{
    const next=new File([file],path.split("/").pop()!,{type:file.type,lastModified:0});
    Object.defineProperty(next,"webkitRelativePath",{value:path});return next;
  };
  const file=restore(source.file,source.path);
  return convertMarkdown(file,[file,...source.assets.map(asset=>restore(asset.file,asset.path))],settings??source.settings,{parsePdf},signal);
}

export { defaultMarkdownSettings };
