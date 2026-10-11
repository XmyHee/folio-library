import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { filesFromDataTransfer } from "../lib/files";

/** Window-wide drop target. Listeners always call the latest import action. */
export function useFileIntake(
  ready: boolean,
  locked: RefObject<boolean>,
  onFiles: (files: File[]) => Promise<void>,
  onError: (message: string) => void,
) {
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const latest = useRef({ ready, onFiles, onError });
  latest.current = { ready, onFiles, onError };

  useEffect(() => {
    let disposed = false;
    const isFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const enter = (event: DragEvent) => {
      if (!isFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      if (latest.current.ready && !locked.current) setOver(true);
    };
    const drag = (event: DragEvent) => {
      if (!isFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = latest.current.ready && !locked.current ? "copy" : "none";
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const drop = async (event: DragEvent) => {
      if (!isFiles(event) || !event.dataTransfer) return;
      event.preventDefault();
      depth.current = 0;
      setOver(false);
      if (!latest.current.ready || locked.current) return;
      try {
        const files = await filesFromDataTransfer(event.dataTransfer);
        if (!disposed && latest.current.ready && !locked.current) await latest.current.onFiles(files);
      } catch (error) {
        if (!disposed) latest.current.onError("无法读取拖入文件：" + String(error));
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", drag);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      disposed = true;
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", drag);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [locked]);

  return { over, fileRef, folderRef };
}
