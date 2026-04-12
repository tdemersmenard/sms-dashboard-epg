"use client";

import { X, Download } from "lucide-react";

interface Props {
  url: string;
  nom: string;
  onClose: () => void;
}

export default function RecuModal({ url, nom, onClose }: Props) {
  const isPdf =
    nom.toLowerCase().endsWith(".pdf") ||
    url.toLowerCase().includes(".pdf");

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <p className="font-medium text-gray-900 text-sm truncate pr-4">{nom}</p>
          <div className="flex items-center gap-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Télécharger"
            >
              <Download size={18} />
            </a>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3 min-h-0">
          {isPdf ? (
            <iframe
              src={url}
              className="w-full rounded border border-gray-100"
              style={{ height: "70vh" }}
              title={nom}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={nom}
              className="w-full h-auto object-contain rounded"
            />
          )}
        </div>
      </div>
    </div>
  );
}
