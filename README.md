# Aura Voice

Aura Voice es un chatbot multimodal construido con Next.js, React y React Three Fiber.
La experiencia esta pensada para combinar conversacion por voz con un avatar 3D capaz de responder con voz sintetizada y gestos faciales expresivos.

## Vision del producto

- Entrada por voz desde el microfono.
- Respuesta por voz con sintesis de audio.
- Avatar 3D como presencia principal de la interfaz.
- Gestos y microexpresiones segun la intencion de la respuesta.
- Base preparada para integrar animaciones como sonrisa, ceja levantada o cambios de actitud.

## Stack actual

- Next.js 16 con App Router.
- React 19.
- TypeScript en modo `strict`.
- Tailwind CSS 4.
- Three.js + React Three Fiber + Drei.

## Estructura

- `app/`: shell principal de la aplicacion.
- `components/home/`: composicion de la home orientada al producto.
- `components/scene/`: escena 3D, viewer y estados de carga/error.
- `lib/`: configuracion base y copy reutilizable del proyecto.
- `public/models/`: assets 3D del avatar.

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm lint`

## Notas de arquitectura

- La pagina principal se mantiene como Server Component.
- La escena 3D vive detras de una frontera cliente clara.
- El modelo `avatar.glb` se carga desde `public/models`.
- La UI ya esta orientada a un chatbot por voz, aunque la logica de STT/TTS y sincronizacion facial aun no esta implementada.

## Siguientes hitos naturales

1. Integrar captura de microfono y speech-to-text.
2. Integrar text-to-speech para respuestas habladas.
3. Mapear intenciones/emociones a animaciones faciales del avatar.
4. Conectar el motor conversacional real del chatbot.
