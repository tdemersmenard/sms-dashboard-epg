"use client";

import { useEffect } from "react";
import Script from "next/script";

/**
 * Meta Pixel (client) + relais Conversions API — dédupliqués par event_id.
 * trackEvent() envoie l'event aux DEUX côtés avec le même id.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export function newEventId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function trackEvent(
  event: "PageView" | "ViewContent" | "Lead" | "InitiateCheckout",
  custom?: Record<string, unknown>,
  eventId?: string,
): string {
  const id = eventId || newEventId(event.toLowerCase());
  if (typeof window !== "undefined") {
    window.fbq?.("track", event, custom || {}, { eventID: id });
    fetch("/api/site/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, event_id: id, url: window.location.href, custom }),
      keepalive: true,
    }).catch(() => {});
  }
  return id;
}

export default function MetaPixel() {
  useEffect(() => {
    if (!PIXEL_ID) return;
    // PageView dédupliqué client/serveur
    const id = newEventId("pageview");
    const fire = () => {
      window.fbq?.("track", "PageView", {}, { eventID: id });
      fetch("/api/site/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "PageView", event_id: id, url: window.location.href }),
        keepalive: true,
      }).catch(() => {});
    };
    if (window.fbq) fire();
    else {
      const t = setInterval(() => {
        if (window.fbq) { clearInterval(t); fire(); }
      }, 200);
      setTimeout(() => clearInterval(t), 5000);
      return () => clearInterval(t);
    }
  }, []);

  if (!PIXEL_ID) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');`}
    </Script>
  );
}
