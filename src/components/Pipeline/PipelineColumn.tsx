"use client";

import { Droppable } from "@hello-pangea/dnd";
import LeadCard from "./LeadCard";
import type { Contact } from "@/lib/types";

const STAGE_COLORS: Record<string, string> = {
  "nouveau":            "#3b82f6",
  "contacté":           "#eab308",
  "soumission envoyée": "#f97316",
  "closé":              "#22c55e",
  "planifié":           "#a855f7",
  "complété":           "#374151",
  "perdu":              "#ef4444",
};

interface Props {
  stage: string;
  contacts: Contact[];
}

export default function PipelineColumn({ stage, contacts }: Props) {
  const color = STAGE_COLORS[stage] ?? "#6b7280";
  const total = contacts.reduce((sum, c) => sum + (c.season_price ?? 0), 0);
  const label = stage.charAt(0).toUpperCase() + stage.slice(1);

  return (
    <div className="flex flex-col w-64 flex-shrink-0">
      {/* Header */}
      <div
        className="rounded-t-lg px-3 py-2.5 bg-white border border-gray-200 border-b-0"
        style={{ borderTop: `4px solid ${color}` }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">{label}</span>
          <span
            className="text-xs font-bold text-white rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5"
            style={{ backgroundColor: color }}
          >
            {contacts.length}
          </span>
        </div>
        {total > 0 && (
          <p className="text-xs text-gray-400 mt-0.5">
            {total.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}
          </p>
        )}
      </div>

      {/* Drop zone */}
      <Droppable droppableId={stage}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 min-h-[120px] rounded-b-lg border border-t-0 border-gray-200 p-2 overflow-y-auto transition-colors ${
              snapshot.isDraggingOver ? "bg-blue-50" : "bg-gray-50"
            }`}
          >
            {contacts.map((c, i) => (
              <LeadCard key={c.id} contact={c} index={i} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
