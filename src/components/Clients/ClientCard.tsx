"use client";

export default function ClientCard({ name }: { name: string }) {
  return <div className="p-4 bg-white rounded shadow text-sm">{name}</div>;
}
