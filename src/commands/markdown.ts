import type { DerivedBook } from "../lib/types";
import type { useTaskState } from "../hooks/useTaskState";
import type { useLibraryState } from "../hooks/useLibraryState";
import type { useBookDetails } from "../hooks/useBookDetails";
import type { MarkdownSettings } from "../lib/markdown/model";
import type { reconvertMarkdown } from "../lib/markdown/import";

export interface MarkdownCommandContext {
  importingRef:ReturnType<typeof useTaskState>["importingRef"];
  taskController:ReturnType<typeof useTaskState>["taskController"];
  storageReady:boolean; draftDirty:boolean;
  settings:MarkdownSettings;
  setBusy:ReturnType<typeof useTaskState>["setBusy"];
  setError:ReturnType<typeof useTaskState>["setError"];
  setProgress:ReturnType<typeof useTaskState>["setProgress"];
  setBooks:ReturnType<typeof useLibraryState>["setBooks"];
  setSelected:ReturnType<typeof useBookDetails>["setSelected"];
  namingMode:ReturnType<typeof useLibraryState>["namingMode"];
  keepOverrides:ReturnType<typeof useLibraryState>["keepOverrides"];
  useOnlineMeta:boolean;
  olByIsbn:ReturnType<typeof useLibraryState>["olByIsbn"];
  parseBook:typeof import("../lib/parse").parseBook;
  runPipeline:typeof import("../lib/pipeline").runPipeline;
  convert?:typeof reconvertMarkdown;
}
export function createMarkdownCommands(getContext:()=>MarkdownCommandContext){
  async function reconvert(book:DerivedBook){
    const c=getContext();
    if(c.importingRef.current||!c.storageReady||!book.markdownSource)return;
    if(c.draftDirty){c.setError("请先保存或放弃详情草稿，再重新转换 PDF。");return;}
    c.importingRef.current=true;c.taskController.current=new AbortController();c.setBusy(true);c.setError(null);
    c.setProgress({done:0,total:1,current:"重新转换 "+book.originalName});
    let converted:import("../lib/types").ParsedBook|undefined;
    try {
      converted=await (c.convert??(await import("../lib/markdown/import")).reconvertMarkdown)(book,c.parseBook,c.taskController.current.signal,c.settings);
      if(converted.status!=="ok")throw new Error(converted.error||"转换失败");
      const next={...book,...converted,id:book.id,manualMetadata:book.manualMetadata,reviewedMetadataKey:book.reviewedMetadataKey,
        coverPreference:book.coverPreference??"original",titleCoverBlob:book.titleCoverBlob,titleCoverUrl:book.titleCoverUrl,
        coverTitle:book.coverTitle,coverAuthor:book.coverAuthor,coverColor:book.coverColor,coverStyleVersion:book.coverStyleVersion,coverlessConfirmed:book.coverlessConfirmed};
      c.setBooks(previous=>previous.map(item=>item.id===book.id?next:item));
      const selected=c.runPipeline([next],c.namingMode,c.keepOverrides,{online:c.useOnlineMeta,olByIsbn:c.olByIsbn}).books[0]!;
      c.setSelected(previous=>previous?.id===book.id?selected:previous);
      if(book.coverUrl)URL.revokeObjectURL(book.coverUrl);
    }catch(error){
      if(converted?.coverUrl)URL.revokeObjectURL(converted.coverUrl);
      c.setError("重新转换未完成，已保留原记录："+String(error));
    }finally{c.importingRef.current=false;c.taskController.current=null;c.setBusy(false);c.setProgress(null);}
  }
  return {reconvert};
}
