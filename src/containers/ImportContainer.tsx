import type { ComponentProps } from "react";
import { ImportArea } from "../components/ImportArea";
import { TaskProgress, type TaskProgressProps } from "../components/TaskProgress";

type Props = Omit<ComponentProps<typeof ImportArea>, "children"> & Pick<TaskProgressProps, "exportProgress">;

/** Compose intake and task feedback without duplicating task or persistence state. */
export function ImportContainer({ exportProgress, ...props }: Props) {
  return <ImportArea {...props}>
    <TaskProgress busy={props.busy} exporting={props.exporting} progress={props.progress}
      exportProgress={exportProgress} olProgress={props.olProgress} coverBatchRunning={props.coverBatchRunning} />
  </ImportArea>;
}
