import { createBookBatchParser, type BookBatchServices } from "./book-batch";
import type { convertMarkdown } from "./markdown/import";
import { defaultMarkdownSettings, type MarkdownSettings } from "./markdown/settings";
const isMarkdown = (file:File) => /\.(?:md|markdown)$/i.test(file.name);
const isMarkdownAsset = (file:File) => /\.(?:png|jpe?g|gif|webp|svg|avif|css)$/i.test(file.name);

/** One intake for books and notes; image assets support Markdown and never become book records. */
export function createImportBatchParser(services:BookBatchServices & {convertMarkdown?:typeof convertMarkdown}){
  return async (files:File[],onProgress:(done:number,total:number,current:string)=>void,concurrency=2,signal?:AbortSignal,settings:MarkdownSettings=defaultMarkdownSettings)=>{
    const markdown=files.some(isMarkdown);
    const records=markdown?files.filter(file=>!isMarkdownAsset(file)):files;
    const parser=createBookBatchParser({
      ...services,
      parseBook:async file=>isMarkdown(file)?(services.convertMarkdown??(await import("./markdown/import")).convertMarkdown)(file,files,settings,{parsePdf:services.parseBook},signal):services.parseBook(file),
      addDocumentCover:book=>book.markdownSource?Promise.resolve(book):services.addDocumentCover(book),
    });
    // Avoid overlapping whole-file parsing buffers for large books.
    const largeFiles = records.some(file => file.size >= 32 * 1024 * 1024);
    return parser(records,onProgress,markdown || largeFiles ? 1 : concurrency,signal);
  };
}
