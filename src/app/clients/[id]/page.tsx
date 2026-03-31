export default function ClientDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Fiche client</h1>
      <p className="text-gray-500">ID: {params.id} — Coming soon.</p>
    </div>
  );
}
