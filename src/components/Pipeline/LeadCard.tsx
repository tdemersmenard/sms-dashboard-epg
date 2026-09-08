"use client";

import { Draggable } from "@hello-pangea/dnd";
import { Phone, Megaphone, Globe, Users } from "lucide-react";
import type { Contact } from "@/lib/types";

function displayName(c: Contact): string {
  const first = c.first_name && c.first_name !== "Inconnu" ? c.first_name : null;
  const last = c.last_name && c.last_name.trim() !== "" ? c.last_name : null;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  if (c.name && c.name !== "Inconnu") return c.name;
  return c.phone ?? "Inconnu";
}

const SOURCE_ICON: Record<string, React.ReactNode> = {
  facebook:  <Megaphone size={12} className="text-acc" />,
  appel:     <Phone size={12} className="text-pos" />,
  referral:  <Users size={12} className="text-orange-500" />,
  site_web:  <Globe size={12} className="text-purple-500" />,
};

interface Props {
  contact: Contact;
  index: number;
}

export default function LeadCard({ contact, index }: Props) {
  return (
    <Draggable draggableId={contact.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => window.location.href = `/clients/${contact.id}`}
          className={`bg-sur rounded-lg border border-line p-3 mb-2 cursor-pointer select-none transition-colors ${
            snapshot.isDragging ? " rotate-1 border-acc" : " hover:border-acc/50"
          }`}
        >
          {/* Name + source */}
          <div className="flex items-start justify-between gap-1 mb-1">
            <p className="text-sm font-semibold text-ink leading-tight">
              {displayName(contact)}
            </p>
            {contact.lead_source && SOURCE_ICON[contact.lead_source] && (
              <span className="flex-shrink-0 mt-0.5">
                {SOURCE_ICON[contact.lead_source]}
              </span>
            )}
          </div>

          {/* Phone */}
          <p className="text-xs text-mut mb-2">{contact.phone}</p>

          {/* Badges row */}
          <div className="flex flex-wrap gap-1">
            {contact.pool_type === "hors-terre" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-chip text-acc font-medium">
                Hors-terre
              </span>
            )}
            {contact.pool_type === "creusée" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-chip text-pos font-medium">
                Creusée
              </span>
            )}
            {(contact.services ?? []).map((s) => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-chip text-mut">
                {s}
              </span>
            ))}
          </div>

          {/* Price */}
          {contact.season_price != null && (
            <p className="text-xs font-bold text-ink num mt-2">
              {contact.season_price.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}
            </p>
          )}
        </div>
      )}
    </Draggable>
  );
}
