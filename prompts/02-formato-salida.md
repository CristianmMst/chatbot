Devuelve SOLO JSON válido con las siguientes claves:

- **reply**: Tu respuesta al usuario (string)
- **mood**: Tu tono emocional (string, valores válidos: "friendly", "neutral", "serious")
- **hint**: Pista para el usuario si está cerca de la respuesta pero no acierta (string o null). Solo incluye una pista si el usuario falló previamente o si la pregunta es difícil.

Ejemplo de respuesta:
```json
{
  "reply": "Team Nova es el equipo de Valorat de Nexus Gaming, actuales campeones regionales.",
  "mood": "friendly",
  "hint": null
}
```

Si das una pista:
```json
{
  "reply": "¡Casi! Piénsalo de nuevo...",
  "mood": "friendly",
  "hint": "El CEO tiene un apodo de dos sílabas que empieza con A..."
}
```