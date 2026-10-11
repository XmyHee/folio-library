import { Lexer, type Token, type Tokens } from "marked";
import type { Content, ContentText, TDocumentDefinitions } from "pdfmake/interfaces";
import { markdownStyles, type MarkdownDocument } from "./model";
import { checkCancelled, imageDimensions } from "./assets";

export type MarkdownDefinition = { definition: TDocumentDefinitions; warnings: string[] };
const safeLink = (href: string) => /^(?:https?:|mailto:)/i.test(href) ? href : undefined;
export const headingId = (text: string) => text.toLowerCase().replace(/[*_`]/g, "").trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");

/** Convert tokens directly to PDF nodes. No HTML is inserted in a browser document. */
export async function buildMarkdownDefinition(doc: MarkdownDocument, image: (href: string) => Promise<string>, signal?: AbortSignal): Promise<MarkdownDefinition> {
  const {styles, warnings} = markdownStyles(doc.settings);
  const content: Content[] = [];
  const headings = new Set<string>();
  const pageWidth = doc.settings.pageSize === "A5" ? 419.53 : doc.settings.pageSize === "LETTER" ? 612 : 595.28;
  const pageHeight = doc.settings.pageSize === "A5" ? 595.28 : doc.settings.pageSize === "LETTER" ? 792 : 841.89;
  const width = (doc.settings.orientation === "landscape" ? pageHeight : pageWidth) - 88;
  let count = 0;
  let authorInserted = false;
  const authorLine = ():Content => ({text:doc.authors.join(" · "),color:"#526172",fontSize:10,margin:[0,0,0,10]});
  const inline = (tokens: Token[] | undefined, fallback = ""): ContentText[] => {
    if (!tokens) return [{text:fallback}];
    return tokens.flatMap((token): ContentText[] => {
      switch (token.type) {
        case "strong": return inline(token.tokens, token.text).map(node=>({...node,bold:true}));
        case "em": return inline(token.tokens, token.text).map(node=>({...node,italics:true}));
        case "del": return inline(token.tokens, token.text).map(node=>({...node,decoration:"lineThrough"}));
        case "codespan": return [{text:token.text,style:"code"}];
        case "link": {
          const text = inline(token.tokens, token.text);
          if (token.href.startsWith("#")) return text.map(node=>({...node,linkToDestination:headingId(decodeURIComponent(token.href.slice(1))),style:"a"}));
          const link = safeLink(token.href);
          if (!link) warnings.push("链接协议未启用：" + token.href);
          return text.map(node=>({...node,...(link?{link,style:"a"}: {})}));
        }
        case "br": return [{text:"\n"}];
        case "image": warnings.push("嵌套格式或表格中的图片仅显示说明文字，请移至独立段落："+token.href); return [{text:token.text ? `[${token.text}]` : ""}];
        case "escape": return [{text:token.text}];
        case "text": return token.tokens ? inline(token.tokens,token.text) : [{text:token.text}];
        case "html": warnings.push("内嵌 HTML 未执行，仅保留可读文字"); return [{text:token.text.replace(/<br\s*\/?\s*>/gi,"\n").replace(/<[^>]*>/g,"")}];
        default: return [{text:"text" in token ? String(token.text) : ""}];
      }
    });
  };
  const paragraph = async (tokens: Token[] | undefined, text: string): Promise<Content[]> => {
    const nodes: Content[] = [], buffer: Token[] = [];
    const flush = () => { if(buffer.length){nodes.push({text:inline(buffer),style:"p"});buffer.length=0;} };
    for (const token of tokens ?? Lexer.lexInline(text)) {
      if (token.type === "image") {
        flush();const data=await image(token.href),[imageWidth,imageHeight]=imageDimensions(data);
        nodes.push({image:data,fit:[Math.min(width,imageWidth*.75),Math.min(350,pageHeight-180,imageHeight*.75)],margin:[0,5,0,10]});
      }
      else buffer.push(token);
    }
    flush(); return nodes;
  };
  const blocks = async (tokens: Token[]): Promise<Content[]> => {
    const nodes: Content[] = [];
    for (const token of tokens) {
      checkCancelled(signal);
      if (++count > 30000) throw new Error("Markdown 内容过多，请分为较小文档");
      switch (token.type) {
        case "space": break;
        case "heading": {
          const base = headingId(token.text) || "heading"; let id = base, suffix = 1;
          while(headings.has(id)) id = `${base}-${++suffix}`; headings.add(id);
          const node:ContentText & {id:string}={text:inline(token.tokens,token.text),style:`h${token.depth}`,headlineLevel:token.depth,id};
          nodes.push(node);
          if(token.depth===1 && doc.authors.length && !authorInserted){nodes.push(authorLine());authorInserted=true;}
          break;
        }
        case "paragraph": case "text": nodes.push(...await paragraph(token.tokens,token.text)); break;
        case "blockquote": nodes.push({stack:await blocks(token.tokens ?? []),style:"blockquote"}); break;
        case "list": {
          const items: Content[] = [];
          for (const item of token.items) {
            const children = await blocks(item.tokens);
            items.push({stack:item.task?[{text:item.checked?"☑":"☐"},...children]:children});
          }
          nodes.push(token.ordered ? {ol:items,start:typeof token.start==="number"?token.start:1,margin:[0,0,0,8]} : {ul:items,margin:[0,0,0,8]}); break;
        }
        case "code": {
          // Soft-wrap long source lines; retain indentation/newlines and allow long blocks to span pages.
          const lineLength=Math.max(28,Math.floor(width/5.5));
          const code=String(token.text).replace(/\t/g,"    ").split("\n").flatMap((line:string)=>{
            const chars=Array.from(line), lines:string[]=[];
            if(!chars.length)return [""];
            for(let i=0;i<chars.length;i+=lineLength)lines.push(chars.slice(i,i+lineLength).join(""));
            return lines;
          }).join("\n");
          nodes.push({text:code,style:"pre",font:/[^\u0000-\u00ff]/.test(code)?"Folio":"Mono",preserveLeadingSpaces:true}); break;
        }
        case "table": {
          if(token.header.length>12)throw new Error("表格超过 12 列，请拆分表格或使用横向页面");
          const table=token as Tokens.Table;
          const rows = [table.header.map((cell,index)=>({text:inline(cell.tokens,cell.text),style:"th",alignment:table.align[index]??"left"})),
            ...table.rows.map(row=>row.map((cell,index)=>({text:inline(cell.tokens,cell.text),style:"td",alignment:table.align[index]??"left"})))];
          const weights=table.header.map((cell,index)=>Math.max(8,Math.min(60,Math.max(...[cell,...table.rows.slice(0,200).map(row=>row[index]!)].map(value=>Array.from(value?.text??"").reduce((size,char)=>size+(/[^\u0000-\u00ff]/.test(char)?1:.55),0))))));
          const total=weights.reduce((sum,value)=>sum+value,0),available=width-table.header.length*16;
          const widths=weights.map(value=>available*value/total);
          const veryLongRows=table.rows.some(row=>row.some(cell=>cell.text.length>1000));
          nodes.push({table:{headerRows:1,widths,body:rows,dontBreakRows:!veryLongRows,keepWithHeaderRows:1},layout:"lightHorizontalLines",style:"table"});break;
        }
        case "hr": nodes.push({canvas:[{type:"line",x1:0,y1:0,x2:width,y2:0,lineWidth:.6,lineColor:"#c8d3df"}],margin:[0,8,0,12]});break;
        case "html":
          if(/<!--\s*pagebreak\s*-->/i.test(token.text))nodes.push({text:"",pageBreak:"before"});
          else {warnings.push("内嵌 HTML 未执行，仅保留可读文字");const text=token.text.replace(/<[^>]*>/g,"").trim();if(text)nodes.push({text,style:"p"});}
          break;
        default: warnings.push("未完整支持的 Markdown 结构："+token.type);
      }
      if(count%30===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    return nodes;
  };
  const tokens=Lexer.lex(doc.body,{gfm:true});
  if(!tokens.some(token=>token.type==="heading"&&token.depth===1)){
    content.push({text:doc.title,style:"h1",headlineLevel:1});
    if(doc.authors.length){content.push(authorLine());authorInserted=true;}
  }
  content.push(...await blocks(tokens));
  const definition:TDocumentDefinitions={
    content,styles,defaultStyle:{...styles.body,font:"Folio"},pageSize:doc.settings.pageSize,
    pageOrientation:doc.settings.orientation,pageMargins:[44,54,44,54],
    info:{title:doc.title,author:doc.authors.join("; "),subject:doc.description,keywords:doc.subjects.join("; "),creator:"Folio Markdown",creationDate:new Date("2000-01-01T00:00:00Z"),modDate:new Date("2000-01-01T00:00:00Z")},
  };
  return {definition,warnings:[...new Set(warnings)]};
}

/** Installed in the render worker because functions cannot cross the worker boundary. */
export function installPagination(definition:TDocumentDefinitions, doc:Pick<MarkdownDocument,"title"|"authors"|"settings">):TDocumentDefinitions {
  const format=(value:string,page:number,pages:number)=>value.replace(/\{(title|author|page|pages)\}/g,(_,key:string)=>({title:doc.title,author:doc.authors.join(" · "),page:doc.settings.pageNumbers?String(page):"",pages:doc.settings.pageNumbers?String(pages):""})[key]!);
  const bar=(value:string,page:number,pages:number):Content=>({text:format(value,page,pages),fontSize:8,color:"#67768a",alignment:"center",margin:[44,18,44,0]});
  const enabled=(value:string)=>!!value&&(doc.settings.pageNumbers||! /\{(?:page|pages)\}/.test(value));
  return {...definition,header:enabled(doc.settings.header)?(page,pages)=>bar(doc.settings.header,page,pages):undefined,
    footer:enabled(doc.settings.footer)?(page,pages)=>bar(doc.settings.footer,page,pages):undefined,
    pageBreakBefore:undefined};
}
