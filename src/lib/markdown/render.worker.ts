/// <reference lib="webworker" />
import pdfMake from "pdfmake/build/pdfmake";
import standardFonts from "pdfmake/build/vfs_fonts";
import type { TFontDictionary, TDocumentDefinitions } from "pdfmake/interfaces";
import { paginateMarkdown } from "./pagination";
import type { MarkdownDocument } from "./model";

self.onmessage=async(event:MessageEvent<{definition:TDocumentDefinitions;doc:MarkdownDocument;font:ArrayBuffer;boldFont:ArrayBuffer}>)=>{
  try {
    const {definition,doc,font,boldFont}=event.data;
    const encode=(buffer:ArrayBuffer)=>{const bytes=new Uint8Array(buffer);let binary="";for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);};
    const vfs={...(standardFonts as unknown as Record<string,string>),"NotoSansSC.ttf":encode(font),"NotoSansSC-Bold.ttf":encode(boldFont)};
    const fonts:TFontDictionary={Folio:{normal:"NotoSansSC.ttf",bold:"NotoSansSC-Bold.ttf",italics:"NotoSansSC.ttf",bolditalics:"NotoSansSC-Bold.ttf"},
      Mono:{normal:"Roboto-Regular.ttf",bold:"Roboto-Medium.ttf",italics:"Roboto-Italic.ttf",bolditalics:"Roboto-MediumItalic.ttf"}};
    // CJK code uses the same embedded CJK font; Roboto is only used for Latin-only code nodes.
    const output=await paginateMarkdown(definition,doc,prepared=>new Promise<Uint8Array>((resolve,reject)=>{
    const stream=pdfMake.createPdf(prepared,undefined,fonts,vfs).getStream();
    const chunks:Uint8Array[]=[];
    stream.on("data",(chunk:Uint8Array)=>chunks.push(new Uint8Array(chunk)));
    stream.on("error",reject);
    stream.on("end",()=>{
      const output=new Uint8Array(chunks.reduce((size,chunk)=>size+chunk.length,0));let offset=0;
      for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
      resolve(output);
    });
    stream.end();
    }));
    self.postMessage({bytes:output.buffer},[output.buffer]);
  }catch(error){self.postMessage({error:String(error)});}
};
