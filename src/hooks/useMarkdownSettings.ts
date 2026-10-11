import { useEffect, useState } from "react";
import { defaultMarkdownSettings, markdownSettings, type MarkdownSettings } from "../lib/markdown/settings";

/** Only print preferences live here; source documents remain owned by the library. */
export function useMarkdownSettings(){
  const [settings,setSettings]=useState<MarkdownSettings>(()=>{
    try{
      const saved=localStorage.getItem("folio-markdown-settings-v2");
      if(saved)return markdownSettings(JSON.parse(saved));
      const legacy=markdownSettings(JSON.parse(localStorage.getItem("folio-markdown-settings")||"null"));
      if(legacy.header==="{title}")legacy.header="";
      return legacy;
    }catch{return defaultMarkdownSettings;}
  });
  useEffect(()=>{try{localStorage.setItem("folio-markdown-settings-v2",JSON.stringify(settings));}catch{/* Preferences remain usable for this session. */}},[settings]);
  return {settings,setSettings};
}
