## Project Context

Aura Voice es un chatbot multimodal con avatar 3D.
La meta del producto es permitir conversacion por voz, respuesta hablada y animaciones faciales sincronizadas con el contenido emocional de cada respuesta.

Principios para contribuir:
- Mantener `app/page.tsx` como shell server cuando sea posible.
- Aislar Three.js / React Three Fiber en fronteras cliente claras.
- Priorizar accesibilidad, rendimiento inicial y semantica HTML.
- Evitar UI falsa: si una accion no existe aun, no modelarla como accion definitiva.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
