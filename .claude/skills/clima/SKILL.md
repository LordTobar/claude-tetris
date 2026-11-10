---
name: clima
description: Consulta clima actual y pronóstico de 3 días de la ubicación local (por IP) o de una ciudad dada. Usar cuando el usuario pida "clima", "tiempo", "temperatura", "va a llover", o invoque /clima [ciudad].
argument-hint: [ciudad opcional]
allowed-tools: Bash(curl:*), PowerShell(Invoke-RestMethod:*)
---

# Clima

Obtener clima local. Responder siempre en español, conciso.

## Pasos

1. Fuente principal: **wttr.in** (sin API key).
   - Sin argumento (ubicación auto por IP):
     `curl -s "https://wttr.in/?format=j1&lang=es"`
   - Con ciudad (`$ARGUMENTS`), URL-encoded (espacios → `+`):
     `curl -s "https://wttr.in/<ciudad>?format=j1&lang=es"`
2. Parsear JSON:
   - Ubicación: `nearest_area[0].areaName[0].value`, `country[0].value`
   - Ahora (`current_condition[0]`): `temp_C`, `FeelsLikeC`, `humidity`, `windspeedKmph`, `lang_es[0].value` (o `weatherDesc[0].value`)
   - Pronóstico: `weather[0..2]` → `date`, `maxtempC`, `mintempC`, descripción de `hourly[4]` (mediodía)
3. Fallback si wttr.in falla o responde vacío: **Open-Meteo**
   - Geocoding: `curl -s "https://geocoding-api.open-meteo.com/v1/search?name=<ciudad>&count=1&language=es"` → `latitude`, `longitude`
   - Sin ciudad: obtener coords por IP con `curl -s "https://ipapi.co/json/"`
   - Clima: `curl -s "https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3"`
4. Si ambas fuentes fallan, avisar y mostrar el error; no inventar datos.

## Formato de salida

```
📍 <Ciudad>, <País>
Ahora: <temp>°C (sensación <feels>°C) · <condición> · humedad <h>% · viento <v> km/h

| Día | Mín | Máx | Condición |
|-----|-----|-----|-----------|
| ... | ... | ... | ...       |
```

Unidades métricas (°C, km/h). Sin texto extra salvo que el usuario pregunte algo específico (ej. "¿lloverá?").

## Notas

- Ubicación por IP puede ser imprecisa (VPN/ISP); mencionarlo si la ciudad parece rara.
- En PowerShell, alternativa a curl: `Invoke-RestMethod "https://wttr.in/?format=j1&lang=es"`.
