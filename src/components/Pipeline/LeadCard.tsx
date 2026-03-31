"use client";

export default function LeadCard({ name }: { name: string }) {
  return <div className="p-3 bg-white rounded shadow text-sm">{name}</div>;
}
