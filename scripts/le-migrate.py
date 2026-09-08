#!/usr/bin/env python3
"""Migration « Ligne d'eau »: mapping des classes Tailwind legacy → tokens sémantiques.
Usage: python3 scripts/le-migrate.py <fichier> [...]
Applique le mapping mécanique; les ajustements fins (héros, gradients) restent manuels."""
import sys, re

MAP = [
    # hovers d'abord (plus spécifiques)
    ("hover:bg-gray-50", "hover:bg-chip"),
    ("hover:bg-gray-100", "hover:bg-chip"),
    ("hover:text-gray-600", "hover:text-ink"),
    ("hover:text-gray-800", "hover:text-ink"),
    ("hover:text-gray-900", "hover:text-ink"),
    ("hover:bg-[#0f2855]", "hover:opacity-90"),
    ("hover:bg-[#1a3a6f]", "hover:opacity-90"),
    # surfaces
    ("bg-white", "bg-sur"),
    ("bg-gray-50", "bg-page"),
    ("bg-gray-100", "bg-chip"),
    ("bg-gray-200", "bg-chip"),
    ("bg-[#0a1f3f]", "btn-glow"),
    # bordures
    ("border-gray-100", "border-line"),
    ("border-gray-200", "border-line"),
    ("border-gray-300", "border-line"),
    ("divide-gray-100", "divide-line"),
    ("divide-gray-200", "divide-line"),
    # texte
    ("text-gray-900", "text-ink"),
    ("text-gray-800", "text-ink"),
    ("text-gray-700", "text-ink"),
    ("text-gray-600", "text-mut"),
    ("text-gray-500", "text-mut"),
    ("text-gray-400", "text-mut"),
    ("text-gray-300", "text-mut"),
    ("text-[#0a1f3f]", "text-acc"),
    # accents legacy
    ("text-blue-600", "text-acc"),
    ("text-blue-800", "text-acc"),
    ("bg-blue-600", "btn-glow"),
    ("bg-blue-100", "bg-chip"),
    ("text-sky-600", "text-acc"),
    ("bg-sky-500", "bg-acc-grad"),
    ("bg-sky-50", "bg-chip"),
    # ombres → design plat (le glow est réservé à btn-glow)
    ("shadow-sm ", " "),
    (" shadow-sm", " "),
    ("shadow-lg ", " "),
]

for path in sys.argv[1:]:
    src = open(path).read()
    n = 0
    for old, new in MAP:
        c = src.count(old)
        if c:
            src = src.replace(old, new)
            n += c
    open(path, "w").write(src)
    print(f"{path}: {n} remplacements")
