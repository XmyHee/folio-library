import { useEffect, useState } from "react";
import { defaultMarkdownSettings, markdownSettings, type MarkdownSettings } from "../lib/markdown/settings";

/** Only print preferences live here; source documents remain owned by the library. */
export function useMarkdownSettings(){
  const [settings,setSettings]=useState<MarkdownSettings>(()=>{
    try{return markdownSettings(JSON.parse(localStorage.getItem("folio-markdown-settings")||"null"));}catch{return defaultMarkdownSettings;}
  });
  useEffect(()=>{try{localStorage.setItem("folio-markdown-settings",JSON.stringify(settings));}catch{/* Preferences remain usable for this session. */}},[settings]);
  return {settings,setSettings};
}
