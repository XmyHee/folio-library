import type { TDocumentDefinitions } from "pdfmake/interfaces";
import type { MarkdownDocument } from "./model";
import { checkCancelled } from "./assets";

/** One self-hosted font request per page; failed loads are retryable. No document data is sent. */
let fontRequest:Promise<ArrayBuffer[]>|undefined;
async function loadFont(){
  if(!fontRequest)fontRequest=Promise.all(["NotoSansSC.ttf.gz","NotoSansSC-Bold.ttf.gz"].map(name=>fetch(`${import.meta.env.BASE_URL}fonts/${name}`,{cache:"force-cache",signal:AbortSignal.timeout(120000)}).then(async response=>{
    if(!response.ok)throw new Error("中文字体加载失败，请联网重试一次");
    const buffer=await response.arrayBuffer(),bytes=new Uint8Array(buffer);
    return bytes[0]===0x1f&&bytes[1]===0x8b ? new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer() : buffer;
  }))).catch(error=>{fontRequest=undefined;throw new Error(error?.name === "TimeoutError" ? "中文字体加载超时，请检查网络后重新转换" : "中文字体加载失败，请检查网络后重新转换");});
  return fontRequest;
}

function waitForFont(signal?:AbortSignal):Promise<ArrayBuffer[]> {
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal?.removeEventListener("abort",abort);reject(new DOMException("转换已取消","AbortError"));};
    signal?.addEventListener("abort",abort,{once:true});
    loadFont().then(value=>{signal?.removeEventListener("abort",abort);resolve(value);},error=>{signal?.removeEventListener("abort",abort);reject(error);});
    if(signal?.aborted)abort();
  });
}

export async function renderMarkdownPdf(definition:TDocumentDefinitions,doc:MarkdownDocument,signal?:AbortSignal):Promise<Blob>{
  checkCancelled(signal);
  const [font,boldFont]=await waitForFont(signal);checkCancelled(signal);
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL("./render.worker.ts",import.meta.url),{type:"module"});
    const finish=(error?:unknown,bytes?:ArrayBuffer)=>{clearTimeout(timeout);signal?.removeEventListener("abort",abort);worker.terminate();if(error)reject(error);else resolve(new Blob([bytes!],{type:"application/pdf"}));};
    const abort=()=>finish(new DOMException("转换已取消","AbortError"));
    const timeout=setTimeout(()=>finish(new Error("PDF 排版超过 90 秒，请缩小文档后重试")),90000);
    signal?.addEventListener("abort",abort,{once:true});
    worker.onmessage=(event:MessageEvent<{error?:string;bytes?:ArrayBuffer}>)=>event.data.error?finish(new Error(event.data.error)):finish(undefined,event.data.bytes);
    worker.onerror=event=>finish(new Error("PDF 排版线程失败："+event.message));
    worker.postMessage({definition,doc,font,boldFont});
    if(signal?.aborted)abort();
  });
}
