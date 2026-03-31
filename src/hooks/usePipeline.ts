"use client";

import { useState } from "react";

export function usePipeline() {
  const [columns] = useState<string[]>([]);
  return { columns };
}
