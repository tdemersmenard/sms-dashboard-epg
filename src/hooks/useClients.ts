"use client";

import { useState } from "react";

export function useClients() {
  const [clients] = useState<unknown[]>([]);
  return { clients };
}
