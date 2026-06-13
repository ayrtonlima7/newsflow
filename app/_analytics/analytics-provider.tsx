'use client';

/**
 * Inicializa o PostHog no client + dispara `$pageview` a cada navegação (App
 * Router não faz isso sozinho) + monta os pixels das plataformas de anúncio
 * (Meta / Google), todos opcionais e env-gated.
 *
 * Tudo é INERTE sem as envs: sem `NEXT_PUBLIC_POSTHOG_KEY` o PostHog não
 * inicializa; sem os IDs de pixel, os scripts não são montados. O componente
 * fica no layout e não renderiza nada visível.
 *
 * Ativação: ver docs/ANALYTICS.md.
 */

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import posthog from 'posthog-js';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID; // ex.: AW-XXXX ou G-XXXX

export function AnalyticsProvider() {
  return (
    <>
      <PostHogInit />
      {/* useSearchParams exige Suspense no App Router (senão deopta a página
          inteira pra client-render). */}
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      <AdPixels />
    </>
  );
}

function PostHogInit() {
  useEffect(() => {
    if (!POSTHOG_KEY || posthog.__loaded) return;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // pageview manual (ver PageviewTracker) — App Router não emite sozinho.
      capture_pageview: false,
      capture_pageleave: true,
      // só cria perfil de pessoa após identify → mais barato e amigável a LGPD.
      person_profiles: 'identified_only',
    });
  }, []);
  return null;
}

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!POSTHOG_KEY || !posthog.__loaded) return;
    posthog.capture('$pageview');
    // dispara em toda mudança de rota (path ou query — UTMs entram aqui).
  }, [pathname, searchParams]);

  return null;
}

/** Pixels das plataformas de anúncio — para conversion tracking DELAS (o funil
 *  detalhado é do PostHog). Cada um só monta se o ID estiver setado. */
function AdPixels() {
  return (
    <>
      {META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      )}

      {GOOGLE_ADS_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-gtag" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${GOOGLE_ADS_ID}');`}
          </Script>
        </>
      )}
    </>
  );
}
