"use client";

export default function ClientCard({ name }: { name: string }) {
  return <div className="p-4 bg-sur rounded-xl border border-line text-sm text-ink">{name}</div>;
}
