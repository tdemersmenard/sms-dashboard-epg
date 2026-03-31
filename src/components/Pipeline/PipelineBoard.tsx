"use client";

import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import PipelineColumn from "./PipelineColumn";
import { STAGES } from "@/hooks/usePipeline";
import type { Contact } from "@/lib/types";

interface Props {
  byStage: Record<string, Contact[]>;
  onDragEnd: (contactId: string, newStage: string) => void;
}

export default function PipelineBoard({ byStage, onDragEnd }: Props) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.destination.droppableId === result.source.droppableId) return;
    onDragEnd(result.draggableId, result.destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 h-full overflow-x-auto pb-4 px-6">
        {STAGES.map((stage) => (
          <PipelineColumn
            key={stage}
            stage={stage}
            contacts={byStage[stage] ?? []}
          />
        ))}
      </div>
    </DragDropContext>
  );
}
