import type { TDocumentDefinitions } from "pdfmake/interfaces";
import type { MarkdownDocument } from "./model";
import { installPagination } from "./definition";

/** Fresh layout passes avoid pdfmake 0.2 reusing mutated table positions. */
export async function paginateMarkdown<T>(definition:TDocumentDefinitions,doc:Pick<MarkdownDocument,"title"|"authors"|"settings">,render:(definition:TDocumentDefinitions)=>Promise<T>):Promise<T>{
  const breaks=new Set<string>();
  for(let pass=0;pass<12;pass++){
    const fresh=structuredClone(definition);
    let heading=0;
    const visit=(value:unknown):void=>{
      if(Array.isArray(value)){value.forEach(visit);return;}
      if(!value||typeof value!=="object")return;
      const node=value as Record<string,unknown>;
      if(node.headlineLevel){node.id ||= `folio-heading-${heading}`;heading++;if(breaks.has(String(node.id)))node.pageBreak="before";}
      Object.values(node).forEach(visit);
    };
    visit(fresh.content);
    const next=new Set<string>();
    const paginated=installPagination(fresh,doc);
    paginated.pageBreakBefore=(node,following,onNext)=>{
      if(node.headlineLevel&&node.id&&following.length===0&&onNext.length>0&&!breaks.has(node.id))next.add(node.id);
      return false;
    };
    const output=await render(paginated);
    if(!next.size)return output;
    next.forEach(id=>breaks.add(id));
  }
  throw new Error("标题分页未能稳定，请调整内容或纸张后重新转换");
}
