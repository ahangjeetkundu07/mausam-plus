/**
 * =============================================================
 * MAUSAM+ BACKEND
 * =============================================================
 *
 * Plain Node.js HTTP server — no npm install required
 * Uses Node's built-in http module and global fetch (Node 18+).
 *
 * Endpoints:
 *
 *   GET  /api/weather?city=<name>
 *   GET  /api/weather/location?latitude=<kjklat>&longitude=<lon>
 *   GET  /api/alerts/location?latitude=<lat>&longitude=<lon>
 *   GET  /api/destinations/weather?cities=<name>,<name>,...
 *
 *   POST /api/contact
 *   GET  /api/contact/messages
 *
 *   GET  /api/health
 *
 * Data sources:
 *   Open-Meteo
 *   BigDataCloud reverse geocoding
 *
 * Port:
 *   5000
 * =============================================================
 */

const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 5000;
const STATIC_ROOT = __dirname;

/* ------------------------------------------------------------
 * API URLs
 * ------------------------------------------------------------ */

const OM_GEOCODE =
  "https://geocoding-api.open-meteo.com/v1/search";

const OM_FORECAST =
  "https://api.open-meteo.com/v1/forecast";

const OM_AIRQUALITY =
  "https://air-quality-api.open-meteo.com/v1/air-quality";

const OM_MARINE =
  "https://marine-api.open-meteo.com/v1/marine";

const REVERSE_GEOCODE =
  "https://api.bigdatacloud.net/data/reverse-geocode-client";

/* ------------------------------------------------------------
 * Contact message storage
 * ------------------------------------------------------------ */

const CONTACT_FILE = path.join(
  __dirname,
  "contact_messages.json"
);

/* ------------------------------------------------------------
 * Small in-memory cache
 * ------------------------------------------------------------ */

const CACHE_TTL_MS = 10 * 60 * 1000;

// Stores completed weather responses.
const cache = new Map();

// Stores requests currently being fetched.
// This prevents multiple identical requests from
// hitting Open-Meteo at the same time.
const inFlight = new Map();

function cacheGet(key) {
  const hit = cache.get(key);

  if (!hit) {
    return null;
  }

  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, {
    value,
    at: Date.now(),
  });
}

/* ------------------------------------------------------------
 * Upstream fetch helper
 * ------------------------------------------------------------ */

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Upstream ${response.status} for ${url}`
    );
  }

  return response.json();
}

/* ------------------------------------------------------------
 * Geocoding
 * ------------------------------------------------------------ */

async function geocodeCity(name) {
  const url =
    `${OM_GEOCODE}` +
    `?name=${encodeURIComponent(name)}` +
    `&count=1` +
    `&language=en` +
    `&format=json`;

  const json = await fetchJson(url);

  if (!json.results || !json.results.length) {
    return null;
  }

  const result = json.results[0];

  return {
    name: result.name,
    admin1: result.admin1 || "",
    country: result.country || "",
    latitude: result.latitude,
    longitude: result.longitude,
  };
}

/* ------------------------------------------------------------
 * Reverse geocoding
 * ------------------------------------------------------------ */

async function reverseGeocode(lat, lon) {
  try {
    const url =
      `${REVERSE_GEOCODE}` +
      `?latitude=${lat}` +
      `&longitude=${lon}` +
      `&localityLanguage=en`;

    const json = await fetchJson(url);

    const name =
      json.city ||
      json.locality ||
      json.principalSubdivision ||
      null;

    if (!name) {
      return null;
    }

    return {
      name,
      admin1: json.principalSubdivision || "",
      country: json.countryName || "",
    };
  } catch (error) {
    return null;
  }
}

/* ------------------------------------------------------------
 * Weather forecast
 * ------------------------------------------------------------ */
async function fetchForecast(lat, lon) {
    const url =
        `${OM_FORECAST}?latitude=${lat}&longitude=${lon}` +
        `&current=` +
        `temperature_2m,` +
        `relative_humidity_2m,` +
        `apparent_temperature,` +
        `pressure_msl,` +
        `wind_speed_10m,` +
        `weather_code` +
        `&hourly=` +
        `temperature_2m,` +
        `precipitation_probability,` +
        `uv_index,` +
        `wind_speed_10m,` +
        `visibility,` +
        `relative_humidity_2m,` +
        `weather_code` +
        `&daily=` +
        `temperature_2m_max,` +
        `temperature_2m_min,` +
        `precipitation_probability_max,` +
        `precipitation_sum,` +
        `sunrise,` +
        `sunset,` +
        `weather_code` +
        `&wind_speed_unit=ms` +
        `&timezone=auto` +
        `&forecast_days=7`;

    console.log("Open-Meteo URL:", url);

    return fetchJson(url).catch((error) => {
        console.error(
            "Open-Meteo forecast error:",
            error.message
        );

        throw error;
    });
}
/* ------------------------------------------------------------
 * Air quality
 * ------------------------------------------------------------ */

async function fetchAirQuality(lat, lon) {
  try {
    const url =
      `${OM_AIRQUALITY}?latitude=${lat}&longitude=${lon}` +
      `&current=` +
      `us_aqi,` +
      `pm2_5,` +
      `pm10,` +
      `grass_pollen,` +
      `birch_pollen,` +
      `ragweed_pollen` +
      `&timezone=auto`;

    return await fetchJson(url);
  } catch (error) {
    return null;
  }
}

/* ------------------------------------------------------------
 * Marine
 * ------------------------------------------------------------ */

async function fetchMarine(lat, lon) {
  try {
    const url =
      `${OM_MARINE}?latitude=${lat}&longitude=${lon}` +
      `&current=wave_height,sea_surface_temperature` +
      `&timezone=auto`;

    return await fetchJson(url);
  } catch (error) {
    return null;
  }
}

/* ------------------------------------------------------------
 * Persona / insight helpers
 * ------------------------------------------------------------ */

function aqiLabel(aqi) {
  if (aqi === null || aqi === undefined) {
    return "Unavailable";
  }

  if (aqi <= 50) {
    return "Good";
  }

  if (aqi <= 100) {
    return "Moderate";
  }

  if (aqi <= 150) {
    return "Unhealthy for sensitive groups";
  }

  if (aqi <= 200) {
    return "Unhealthy";
  }

  return "Very unhealthy";
}

function pollenLabel(value) {
  if (value === null || value === undefined) {
    return "No data";
  }

  if (value < 20) {
    return "Low";
  }

  if (value < 50) {
    return "Moderate";
  }

  if (value < 100) {
    return "High";
  }

  return "Very high";
}

function uvLabel(uv) {
  if (uv === null || uv === undefined) {
    return "No data";
  }

  if (uv < 3) {
    return "Low";
  }

  if (uv < 6) {
    return "Moderate";
  }

  if (uv < 8) {
    return "High";
  }

  if (uv < 11) {
    return "Very high";
  }

  return "Extreme";
}

function bestRunningWindow(hourly) {
  if (
    !hourly ||
    !hourly.time ||
    !hourly.time.length
  ) {
    return "Unavailable";
  }

  const n = Math.min(
    24,
    hourly.time.length
  );

  let best = {
    score: -Infinity,
    i: 0,
  };

  for (let i = 0; i < n; i++) {
    const temperature =
      hourly.temperature_2m?.[i] ?? 21;

    const wind =
      hourly.wind_speed_10m?.[i] ?? 0;

    const uv =
      hourly.uv_index?.[i] ?? 0;

    const rain =
      hourly.precipitation_probability?.[i] ?? 0;

    const score =
      -Math.abs(temperature - 16.5) -
      wind * 0.5 -
      uv * 1.2 -
      rain * 0.3;

    if (score > best.score) {
      best = {
        score,
        i,
      };
    }
  }

  const start = best.i;

  const end = Math.min(
    start + 2,
    hourly.time.length - 1
  );

  const formatTime = (iso) =>
    new Date(iso).toLocaleTimeString(
      "en-US",
      {
        hour: "numeric",
      }
    );

  return (
    `${formatTime(hourly.time[start])}` +
    ` - ` +
    `${formatTime(hourly.time[end])}`
  );
}

function comfortIndex(
  tempC,
  humidity,
  windMs
) {
  const windKmh = windMs * 3.6;

  let score = 100;

  score -=
    Math.abs(tempC - 21) * 3.2;

  score -=
    Math.max(0, humidity - 55) * 0.6;

  score -=
    Math.max(0, windKmh - 25) * 0.5;

  score = Math.max(
    0,
    Math.min(
      100,
      Math.round(score)
    )
  );

  let label = "Poor";

  if (score >= 80) {
    label = "Ideal";
  } else if (score >= 60) {
    label = "Good";
  } else if (score >= 35) {
    label = "Fair";
  }

  return {
    score,
    label,
  };
}

function frostRisk(daily) {
  if (
    !daily ||
    !daily.temperature_2m_min ||
    !daily.time
  ) {
    return null;
  }

  const index =
    daily.temperature_2m_min.findIndex(
      (temperature) =>
        temperature <= 1
    );

  if (index === -1) {
    return null;
  }

  return new Date(
    daily.time[index]
  ).toLocaleDateString(
    "en-US",
    {
      weekday: "short",
    }
  );
}

function packingSuggestions(
  daily,
  locationLabel
) {
  const tips = [];

  const rainValues =
    daily.precipitation_probability_max?.slice(
      0,
      3
    ) || [];

  const rainMax =
    rainValues.length
      ? Math.max(...rainValues)
      : 0;

  if (rainMax >= 40) {
    tips.push(
      `Carry a raincoat or compact umbrella` +
      `${locationLabel ? " in " + locationLabel : ""}` +
      ` — rain chance up to ${Math.round(
        rainMax
      )}%`
    );
  }

  const highValues =
    daily.temperature_2m_max?.slice(
      0,
      3
    ) || [];

  const lowValues =
    daily.temperature_2m_min?.slice(
      0,
      3
    ) || [];

  const highMax =
    highValues.length
      ? Math.max(...highValues)
      : null;

  const lowMin =
    lowValues.length
      ? Math.min(...lowValues)
      : null;

  if (
    highMax !== null &&
    highMax >= 27
  ) {
    tips.push(
      "Light, breathable layers — highs near " +
      Math.round(highMax) +
      "°C"
    );
  }

  if (
    lowMin !== null &&
    lowMin <= 8
  ) {
    tips.push(
      "Bring a warm layer for cooler evenings"
    );
  }

  if (!tips.length) {
    tips.push(
      "Conditions look settled — pack normally"
    );
  }

  return tips;
}

function soilMoistureEstimate(daily) {
  const values =
    daily.precipitation_sum?.slice(
      0,
      3
    ) || [];

  const total =
    values.reduce(
      (a, b) => a + b,
      0
    );

  if (total > 15) {
    return "Saturated — hold off on irrigation";
  }

  if (total > 8) {
    return "Well watered";
  }

  if (total > 2) {
    return "Adequate, monitor closely";
  }

  return "Dry — consider irrigating";
}

function plantingTip(
  tempC,
  daily
) {
  const rain7 =
    daily.precipitation_sum?.reduce(
      (a, b) => a + b,
      0
    ) || 0;

  if (tempC < 10) {
    return "Soil is cool — hold off on warm-season seedlings.";
  }

  if (tempC > 24) {
    return "Warm conditions — water young transplants in the early morning or evening.";
  }

  if (rain7 > 40) {
    return "A wet week ahead — good for transplanting, watch for waterlogging.";
  }

  return "Favorable window for planting and transplanting.";
}

function beachConditionLabel(
  waveHeight
) {
  if (
    waveHeight === null ||
    waveHeight === undefined
  ) {
    return "No data";
  }

  if (waveHeight < 0.5) {
    return "Calm";
  }

  if (waveHeight < 1.25) {
    return "Moderate";
  }

  if (waveHeight < 2.5) {
    return "Rough";
  }

  return "Very rough";
}

function commuteCaution(
  visibilityKm,
  rain6h,
  fogSoon
) {
  if (
    fogSoon ||
    (
      visibilityKm !== null &&
      visibilityKm < 2
    ) ||
    rain6h >= 70
  ) {
    return "High";
  }

  if (
    (
      visibilityKm !== null &&
      visibilityKm < 5
    ) ||
    rain6h >= 40
  ) {
    return "Moderate";
  }

  return "Low";
}

/* ------------------------------------------------------------
 * Weather alert helpers
 * ------------------------------------------------------------ */

const SEVERE_CODES = new Set([
  95,
  96,
  99,
]);

const FOG_CODES = new Set([
  45,
  48,
]);

const ALERT_SEVERITY = {
  "HIGH RISK": 3,
  "MODERATE RISK": 2,
  "LOW RISK": 1,
};

function alertIcon(category) {
  return {
    thunderstorm: "⛈️",
    rain: "🌧️",
    heat: "🌡️",
    frost: "❄️",
    wind: "💨",
    fog: "🌫️",
  }[category] || "⚠️";
}

function alertAdvice(category) {
  return {
    thunderstorm:
      "Move indoors and avoid open ground or tall isolated objects.",

    rain:
      "Allow extra travel time and do not drive through flooded roads.",

    heat:
      "Hydrate regularly and limit strenuous outdoor activity during peak heat.",

    frost:
      "Cover sensitive plants and protect exposed pipes overnight.",

    wind:
      "Secure loose objects and use extra care when driving high-profile vehicles.",

    fog:
      "Use low-beam headlights and leave extra distance while travelling.",
  }[category] ||
    "Check local conditions before making outdoor plans.";
}

function finalizeAlerts(
  alerts,
  generatedAt
) {
  return alerts
    .sort(
      (a, b) =>
        (
          ALERT_SEVERITY[b.severity] || 0
        ) -
        (
          ALERT_SEVERITY[a.severity] || 0
        )
    )
    .map(
      (alert, index) => ({
        ...alert,
        id:
          `${alert.category}-${index + 1}`,
        icon:
          alertIcon(alert.category),
        advice:
          alertAdvice(alert.category),
        source:
          "Derived from live forecast data",
        generated_at:
          generatedAt,
      })
    );
}

function buildAlertSummary(
  alerts,
  generatedAt
) {
  const highest =
    alerts[0]?.severity ||
    "NO RISK";

  return {
    count: alerts.length,

    status:
      alerts.length
        ? "weather_risks_detected"
        : "all_clear",

    highest_severity:
      highest,

    generated_at:
      generatedAt,

    source:
      "Forecast-derived guidance, not an official government warning.",
  };
}

function buildAlerts(
  current,
  hourly,
  daily,
  locationLabel
) {
  const alerts = [];

  const generatedAt =
    current.time ||
    new Date().toISOString();

  /* Thunderstorm now */

  if (
    SEVERE_CODES.has(
      current.weather_code
    )
  ) {
    alerts.push({
      title:
        "Thunderstorm Warning",

      description:
        "Thunderstorms are active in your area. Avoid open ground and seek shelter indoors.",

      time: "Now",

      area:
        locationLabel,

      severity:
        "HIGH RISK",

      category:
        "thunderstorm",
    });
  }

  /* Heavy rain */

  const rainMax =
    daily.precipitation_probability_max?.[0] ||
    0;

  if (rainMax >= 60) {
    alerts.push({
      title:
        "Heavy Rainfall Warning",

      description:
        `Heavy rainfall is likely today (${rainMax}% chance). Exercise caution while travelling and avoid waterlogged areas.`,

      time:
        "Today",

      area:
        locationLabel,

      severity:
        rainMax >= 80
          ? "HIGH RISK"
          : "MODERATE RISK",

      category:
        "rain",
    });
  }

  /* Extreme heat */

  if (
    current.apparent_temperature >= 40
  ) {
    alerts.push({
      title:
        "Extreme Heat Advisory",

      description:
        `Feels-like temperature is reaching ${Math.round(
          current.apparent_temperature
        )}°C. Limit outdoor exposure and stay hydrated.`,

      time:
        "Today",

      area:
        locationLabel,

      severity:
        "HIGH RISK",

      category:
        "heat",
    });
  }

  /* Frost */

  const frostDay =
    frostRisk(daily);

  if (frostDay) {
    alerts.push({
      title:
        "Frost Advisory",

      description:
        `Overnight temperatures are expected to drop near freezing on ${frostDay}. Protect sensitive plants and pipes.`,

      time:
        frostDay,

      area:
        locationLabel,

      severity:
        "LOW RISK",

      category:
        "frost",
    });
  }

  /* High wind */

  if (
    current.wind_speed_10m * 3.6 >= 50
  ) {
    alerts.push({
      title:
        "High Wind Advisory",

      description:
        `Sustained winds near ${Math.round(
          current.wind_speed_10m * 3.6
        )} km/h. Secure loose outdoor items.`,

      time:
        "Now",

      area:
        locationLabel,

      severity:
        "MODERATE RISK",

      category:
        "wind",
    });
  }

  /* Fog */

  const closestFog =
    hourly.weather_code
      .slice(0, 6)
      .some(
        (code) =>
          FOG_CODES.has(code)
      );

  if (closestFog) {
    alerts.push({
      title:
        "Fog Advisory",

      description:
        "Reduced visibility expected in the next few hours. Allow extra travel time and use fog lights.",

      time:
        "Next 6 hours",

      area:
        locationLabel,

      severity:
        "LOW RISK",

      category:
        "fog",
    });
  }

  /* Future thunderstorm */

  const futureStormDay =
    daily.weather_code.findIndex(
      (code, index) =>
        index > 0 &&
        SEVERE_CODES.has(code)
    );

  if (futureStormDay !== -1) {
    alerts.push({
      title:
        "Thunderstorm Watch",

      description:
        `Thunderstorm conditions are possible on ${daily.time[futureStormDay]}. Review outdoor plans before you leave.`,

      time:
        daily.time[futureStormDay],

      area:
        locationLabel,

      severity:
        "MODERATE RISK",

      category:
        "thunderstorm",
    });
  }

  return finalizeAlerts(
    alerts,
    generatedAt
  );
}

/* ------------------------------------------------------------
 * Weather bundle
 * ------------------------------------------------------------ */

async function fetchBundle(lat, lon) {
  const cacheKey =
    `w:${lat.toFixed(2)},${lon.toFixed(2)}`;

  // 1. Return cached data when available.
  const cached = cacheGet(cacheKey);

  if (cached) {
    return cached;
  }

  // 2. If the exact same location is already being
  //    fetched, wait for that existing request instead
  //    of creating another Open-Meteo request.
  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey);
  }

  // 3. Create one shared request for this location.
  const requestPromise = (async () => {
    const [
      forecastResult,
      airResult,
      marineResult,
    ] = await Promise.allSettled([
      fetchForecast(lat, lon),
      fetchAirQuality(lat, lon),
      fetchMarine(lat, lon),
    ]);

    if (forecastResult.status !== "fulfilled") {
      console.error(
        "Open-Meteo forecast error:",
        forecastResult.reason
      );

      throw new Error(
        forecastResult.reason?.message ||
        "Forecast data unavailable right now"
      );
    }

    const bundle = {
      forecast:
        forecastResult.value,

      air:
        airResult.status === "fulfilled"
          ? airResult.value
          : null,

      marine:
        marineResult.status === "fulfilled"
          ? marineResult.value
          : null,
    };

    // 4. Save only successful results.
    cacheSet(cacheKey, bundle);

    return bundle;
  })();

  // 5. Remember the active request.
  inFlight.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    // 6. Always remove the active request when finished,
    //    whether successful or failed.
    inFlight.delete(cacheKey);
  }
}
/* ------------------------------------------------------------
 * Build persona insights
 * ------------------------------------------------------------ */

function buildInsights(
  forecast,
  air,
  marine,
  locationLabel
) {
  const aq =
    air?.current?.us_aqi ??
    null;

  const pm25 =
    air?.current?.pm2_5 ??
    null;

  const pm10 =
    air?.current?.pm10 ??
    null;

  const grassPollen =
    air?.current?.grass_pollen ??
    null;

  const birchPollen =
    air?.current?.birch_pollen ??
    null;

  const ragweedPollen =
    air?.current?.ragweed_pollen ??
    null;

  const wave =
    marine?.current?.wave_height ??
    null;

  const seaTemp =
    marine?.current
      ?.sea_surface_temperature ??
    null;

  const uvNow =
    forecast.current.uv_index ??
    null;

  const visibilityKm =
    forecast.hourly.visibility?.[0] !==
      undefined &&
    forecast.hourly.visibility?.[0] !==
      null
      ? Math.round(
          forecast.hourly.visibility[0] /
            1000
        )
      : null;

  const rainValues =
    forecast.hourly
      .precipitation_probability
      ?.slice(0, 6) || [];

  const rain6h =
    rainValues.length
      ? Math.max(...rainValues)
      : 0;

  const fogSoon =
    forecast.hourly.weather_code
      .slice(0, 6)
      .some(
        (code) =>
          FOG_CODES.has(code)
      );

  return {
    /* ---------------- Health ---------------- */

    health: {
      aqi:
        aq,

      aqi_label:
        aqiLabel(aq),

      pm2_5:
        pm25,

      pm10:
        pm10,

      pollen: {
        grass: {
          value:
            grassPollen,

          label:
            pollenLabel(
              grassPollen
            ),
        },

        birch: {
          value:
            birchPollen,

          label:
            pollenLabel(
              birchPollen
            ),
        },

        ragweed: {
          value:
            ragweedPollen,

          label:
            pollenLabel(
              ragweedPollen
            ),
        },
      },

      uv_index:
        uvNow,

      uv_label:
        uvLabel(uvNow),

      humidity:
        forecast.current
          .relative_humidity_2m,

      tip:
        aq !== null && aq > 100
          ? "Air quality is unhealthy for sensitive groups — consider a mask outdoors and keep windows closed."
          : (
              (grassPollen !== null &&
                grassPollen >= 50) ||
              (birchPollen !== null &&
                birchPollen >= 50) ||
              (ragweedPollen !== null &&
                ragweedPollen >= 50)
            )
          ? "Pollen is running high — allergy sufferers may want antihistamines on hand today."
          : "Air quality and pollen look manageable today.",
    },

    /* ---------------- Fitness ---------------- */

    fitness: {
      sunrise:
        forecast.daily.sunrise[0],

      sunset:
        forecast.daily.sunset[0],

      best_running_window:
        bestRunningWindow(
          forecast.hourly
        ),

      wind_speed_kmh:
        Math.round(
          forecast.current
            .wind_speed_10m * 3.6
        ),

      heat_alert:
        forecast.current
          .apparent_temperature >= 32,

      uv_label:
        uvLabel(uvNow),

      tip:
        forecast.current
          .apparent_temperature >= 32
          ? "Feels-like temperature is high — shift hard efforts to the cooler running window below."
          : "Good conditions for outdoor training — hydrate as usual.",
    },

    /* ---------------- Beach ---------------- */

    beach: {
      wave_height_m:
        wave,

      sea_surface_temperature_c:
        seaTemp,

      available:
        wave !== null ||
        seaTemp !== null,

      condition_label:
        beachConditionLabel(
          wave
        ),

      uv_index:
        uvNow,

      uv_label:
        uvLabel(uvNow),

      tide_note:
        "Live tide tables need a keyed marine-tide provider, which this free build doesn't call — wave height and sea temperature above are live, tide timing is not shown.",

      tip:
        wave !== null &&
        wave >= 2.5
          ? "Sea is rough today — better suited to experienced surfers than casual swimming."
          : "Sea conditions look manageable — check local flags before swimming.",
    },

    /* ---------------- Travel ---------------- */

    travel: {
      rain_delay_risk_percent:
        forecast.daily
          .precipitation_probability_max[0],

      packing_suggestions:
        packingSuggestions(
          forecast.daily,
          locationLabel
        ),

      flight_disruption_risk:
        SEVERE_CODES.has(
          forecast.current.weather_code
        ) ||
        forecast.daily
          .precipitation_probability_max[0] >= 70
          ? "Elevated"
          : "Low",
    },

    /* ---------------- Family ---------------- */

    family: {
      rain_probability_percent:
        forecast.daily
          .precipitation_probability_max[0],

      severe_weather_day:
        (() => {
          const index =
            forecast.daily.weather_code.findIndex(
              (code) =>
                SEVERE_CODES.has(code)
            );

          return index === -1
            ? null
            : forecast.daily.time[index];
        })(),

      school_commute_caution:
        commuteCaution(
          visibilityKm,
          rain6h,
          fogSoon
        ),

      tip:
        forecast.daily
          .precipitation_probability_max[0] >= 50
          ? "Good chance of rain during school hours — pack an umbrella or raincoat."
          : "Routine commute conditions expected for the school run.",
    },

    /* ---------------- Agriculture ---------------- */

    agriculture: {
      rainfall_3day_mm:
        Math.round(
          forecast.daily
            .precipitation_sum
            .slice(0, 3)
            .reduce(
              (a, b) => a + b,
              0
            ) * 10
        ) / 10,

      rainfall_7day_mm:
        Math.round(
          forecast.daily
            .precipitation_sum
            .reduce(
              (a, b) => a + b,
              0
            ) * 10
        ) / 10,

      soil_moisture_estimate:
        soilMoistureEstimate(
          forecast.daily
        ),

      frost_risk_day:
        frostRisk(
          forecast.daily
        ),

      planting_favorable:
        forecast.current
          .temperature_2m >= 10 &&
        forecast.current
          .temperature_2m <= 24,

      planting_tip:
        plantingTip(
          forecast.current
            .temperature_2m,
          forecast.daily
        ),
    },

    /* ---------------- Commute ---------------- */

    commute: {
      visibility_km:
        visibilityKm,

      rain_next_6h_percent:
        rain6h,

      fog_risk_next_6h:
        fogSoon,

      caution_level:
        commuteCaution(
          visibilityKm,
          rain6h,
          fogSoon
        ),

      traffic_note:
        "Live traffic feeds need a keyed mapping provider (e.g. Google/TomTom), which this free build doesn't call — the caution level above is a weather-only proxy (visibility, rain, fog), not live congestion.",
    },

    /* ---------------- Events ---------------- */

    events: {
      comfort_index:
        comfortIndex(
          forecast.current
            .temperature_2m,

          forecast.current
            .relative_humidity_2m,

          forecast.current
            .wind_speed_10m
        ),

      rain_probability_percent:
        forecast.daily
          .precipitation_probability_max[0],

      extended_forecast:
        forecast.daily.time.map(
          (time, index) => ({
            date:
              time,

            rain_probability_percent:
              forecast.daily
                .precipitation_probability_max[index],

            high_c:
              Math.round(
                forecast.daily
                  .temperature_2m_max[index]
              ),

            low_c:
              Math.round(
                forecast.daily
                  .temperature_2m_min[index]
              ),
          })
        ),
    },
  };
}

/* ------------------------------------------------------------
 * Complete weather payload
 * ------------------------------------------------------------ */

async function buildWeatherPayload(
  lat,
  lon,
  locationMeta
) {
  const {
    forecast,
    air,
    marine,
  } =
    await fetchBundle(
      lat,
      lon
    );

  const locationLabel =
    locationMeta?.name
      ? [
          locationMeta.name,
          locationMeta.country,
        ]
          .filter(Boolean)
          .join(", ")
      : "Your current location";

  const insights =
    buildInsights(
      forecast,
      air,
      marine,
      locationLabel
    );

  const alerts =
    buildAlerts(
      forecast.current,
      forecast.hourly,
      forecast.daily,
      locationLabel
    );

  return {
    success: true,

    location: {
      name:
        locationMeta?.name ||
        "Your current location",

      admin1:
        locationMeta?.admin1 ||
        "",

      country:
        locationMeta?.country ||
        "",

      latitude:
        lat,

      longitude:
        lon,
    },

    latitude:
      lat,

    longitude:
      lon,

    current:
      forecast.current,

    hourly:
      forecast.hourly,

    daily:
      forecast.daily,

    insights:
      insights,

    alerts:
      alerts,

    alert_summary:
      buildAlertSummary(
        alerts,
        forecast.current.time ||
          new Date().toISOString()
      ),
  };
}

/* ============================================================
 * ROUTE HANDLERS
 * ============================================================ */

/* ------------------------------------------------------------
 * GET /api/weather?city=London
 * ------------------------------------------------------------ */

async function handleWeatherByCity(
  query,
  res
) {
  const city =
    (
      query.get("city") ||
      ""
    ).trim();

  if (!city) {
    return sendJson(
      res,
      200,
      {
        success: false,
        message:
          "Please provide a city name.",
      }
    );
  }

  try {
    const place =
      await geocodeCity(city);

    if (!place) {
      return sendJson(
        res,
        200,
        {
          success: false,
          message:
            `Location "${city}" not found.`,
        }
      );
    }

    const payload =
      await buildWeatherPayload(
        place.latitude,
        place.longitude,
        place
      );

    return sendJson(
      res,
      200,
      payload
    );
  } catch (error) {
    console.error(
      "handleWeatherByCity error:",
      error.message
    );

    return sendJson(
      res,
      200,
      {
        success: false,
        message:
          "Weather data unavailable right now.",
      }
    );
  }
}

/* ------------------------------------------------------------
 * GET /api/weather/location
 * ------------------------------------------------------------ */

async function handleWeatherByLocation(
  query,
  res
) {
  const lat =
    parseFloat(
      query.get("latitude")
    );

  const lon =
    parseFloat(
      query.get("longitude")
    );

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return sendJson(
      res,
      200,
      {
        success: false,
        message:
          "Provide valid latitude (-90 to 90) and longitude (-180 to 180) values.",
      }
    );
  }

  try {
    const place =
      await reverseGeocode(
        lat,
        lon
      );

    const payload =
      await buildWeatherPayload(
        lat,
        lon,
        place
      );

    return sendJson(
      res,
      200,
      payload
    );
  } catch (error) {
    console.error(
      "handleWeatherByLocation error:",
      error.message
    );

    return sendJson(
      res,
      200,
      {
        success: false,
        message:
          "Weather data unavailable right now.",
      }
    );
  }
}

/* ------------------------------------------------------------
 * GET /api/alerts/location
 * ------------------------------------------------------------ */

async function handleAlertsByLocation(
  query,
  res
) {
  const lat =
    parseFloat(
      query.get("latitude")
    );

  const lon =
    parseFloat(
      query.get("longitude")
    );

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return sendJson(
      res,
      200,
      {
        success: false,
        message:
          "Provide valid latitude (-90 to 90) and longitude (-180 to 180) values.",
      }
    );
  }

  try {
    const place =
      await reverseGeocode(
        lat,
        lon
      );

    const locationLabel =
      place?.name
        ? [
            place.name,
            place.country,
          ]
            .filter(Boolean)
            .join(", ")
        : "Your current location";

    const {
      forecast,
    } =
      await fetchBundle(
        lat,
        lon
      );

    const alerts =
      buildAlerts(
        forecast.current,
        forecast.hourly,
        forecast.daily,
        locationLabel
      );

    return sendJson(
      res,
      200,
      {
        success: true,

        area:
          locationLabel,

        alerts:
          alerts,

        alert_summary:
          buildAlertSummary(
            alerts,
            forecast.current.time ||
              new Date().toISOString()
          ),
      }
    );
  } catch (error) {
    console.error(
      "handleAlertsByLocation error:",
      error.message
    );

    return sendJson(
      res,
      200,
      {
        success: false,
        message:
          "Alerts unavailable right now.",
      }
    );
  }
}

/* ------------------------------------------------------------
 * GET /api/destinations/weather
 *
 * Example:
 * /api/destinations/weather?cities=Paris,Tokyo,Delhi
 * ------------------------------------------------------------ */

async function handleDestinationsWeather(
  query,
  res
) {
  const raw =
    (
      query.get("cities") ||
      ""
    ).trim();

  if (!raw) {
    return sendJson(
      res,
      200,
      {
        success: false,
        message:
          "Provide at least one city in ?cities=",
      }
    );
  }

  const cities =
    raw
      .split(",")
      .map(
        (city) => city.trim()
      )
      .filter(Boolean)
      .slice(0, 8);

  const results =
    await Promise.all(
      cities.map(
        async (city) => {
          try {
            const place =
              await geocodeCity(
                city
              );

            if (!place) {
              return {
                city,
                success: false,
                message:
                  "Not found",
              };
            }

            const {
              forecast,
            } =
              await fetchBundle(
                place.latitude,
                place.longitude
              );

            const locationLabel =
              [
                place.name,
                place.country,
              ]
                .filter(Boolean)
                .join(", ");

            const alerts =
              buildAlerts(
                forecast.current,
                forecast.hourly,
                forecast.daily,
                locationLabel
              );

            return {
              city,

              success:
                true,

              location:
                locationLabel,

              temperature_c:
                Math.round(
                  forecast.current
                    .temperature_2m
                ),

              weather_code:
                forecast.current
                  .weather_code,

              rain_probability_percent:
                forecast.daily
                  .precipitation_probability_max[0],

              alert_count:
                alerts.length,

              top_alert:
                alerts[0] ||
                null,
            };
          } catch (error) {
            return {
              city,
              success: false,
              message:
                "Weather unavailable",
            };
          }
        }
      )
    );

  return sendJson(
    res,
    200,
    {
      success: true,
      destinations:
        results,
    }
  );
}

/* ============================================================
 * CONTACT FORM
 * ============================================================ */

/* ------------------------------------------------------------
 * Read contact messages
 * ------------------------------------------------------------ */

function readContactMessages() {
  try {
    if (
      !fs.existsSync(
        CONTACT_FILE
      )
    ) {
      return [];
    }

    const content =
      fs.readFileSync(
        CONTACT_FILE,
        "utf8"
      );

    if (!content.trim()) {
      return [];
    }

    const messages =
      JSON.parse(content);

    if (!Array.isArray(messages)) {
      return [];
    }

    return messages;
  } catch (error) {
    console.error(
      "Could not read contact messages:",
      error.message
    );

    return [];
  }
}

/* ------------------------------------------------------------
 * Save contact message
 * ------------------------------------------------------------ */

function saveContactMessage(
  message
) {
  const messages =
    readContactMessages();

  messages.push(message);

  fs.writeFileSync(
    CONTACT_FILE,
    JSON.stringify(
      messages,
      null,
      2
    ),
    "utf8"
  );
}

/* ------------------------------------------------------------
 * POST /api/contact
 * ------------------------------------------------------------ */

function handleContact(
  req,
  res
) {
  let body = "";

  let tooLarge = false;

  req.on(
    "data",
    (chunk) => {
      if (tooLarge) {
        return;
      }

      body += chunk.toString();

      if (body.length > 100000) {
        tooLarge = true;

        return sendJson(
          res,
          413,
          {
            success: false,
            message:
              "Contact message is too large.",
          }
        );
      }
    }
  );

  req.on(
    "end",
    () => {
      if (tooLarge) {
        return;
      }

      try {
        const data =
          JSON.parse(
            body || "{}"
          );

        const name =
          typeof data.name ===
          "string"
            ? data.name.trim()
            : "";

        const email =
          typeof data.email ===
          "string"
            ? data.email.trim()
            : "";

        const subject =
          typeof data.subject ===
          "string"
            ? data.subject.trim()
            : "";

        const message =
          typeof data.message ===
          "string"
            ? data.message.trim()
            : "";

        if (
          !name ||
          !email ||
          !subject ||
          !message
        ) {
          return sendJson(
            res,
            400,
            {
              success: false,
              message:
                "All fields are required.",
            }
          );
        }

        const contactMessage = {
          id:
            Date.now(),

          name:
            name,

          email:
            email,

          subject:
            subject,

          message:
            message,

          createdAt:
            new Date().toISOString(),
        };

        saveContactMessage(
          contactMessage
        );

        console.log(
          "MAUSAM+ contact message received:",
          contactMessage
        );

        return sendJson(
          res,
          200,
          {
            success: true,

            message:
              "Message received. We'll get back to you soon.",
          }
        );
      } catch (error) {
        console.error(
          "handleContact error:",
          error.message
        );

        return sendJson(
          res,
          400,
          {
            success: false,
            message:
              "Invalid contact payload.",
          }
        );
      }
    }
  );

  req.on(
    "error",
    (error) => {
      console.error(
        "Contact request error:",
        error.message
      );
    }
  );
}

/* ------------------------------------------------------------
 * GET /api/contact/messages
 *
 * This returns all saved contact messages.
 * No authentication is used because it was not requested.
 * ------------------------------------------------------------ */

function handleGetContactMessages(
  req,
  res
) {
  try {
    const messages =
      readContactMessages();

    return sendJson(
      res,
      200,
      {
        success: true,

        count:
          messages.length,

        messages:
          messages,
      }
    );
  } catch (error) {
    console.error(
      "Could not load contact messages:",
      error.message
    );

    return sendJson(
      res,
      500,
      {
        success: false,
        message:
          "Could not load contact messages.",
      }
    );
  }
}

/* ============================================================
 * HTTP HELPERS
 * ============================================================ */

function sendJson(
  res,
  status,
  obj
) {
  if (res.headersSent) {
    return;
  }

  const body =
    JSON.stringify(obj);

  res.writeHead(
    status,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Methods":
        "GET, POST, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type",
    }
  );

  res.end(body);
}

/* ------------------------------------------------------------
 * Static files
 * ------------------------------------------------------------ */

function serveStatic(
  pathname,
  res
) {
  if (pathname === "/") {
    pathname =
      "/index.html";
  }

  let filePath;

  try {
    filePath =
      path.resolve(
        STATIC_ROOT,
        "." +
          decodeURIComponent(
            pathname
          )
      );
  } catch (error) {
    return false;
  }

  if (
    !filePath.startsWith(
      STATIC_ROOT + path.sep
    )
  ) {
    return false;
  }

  if (
    !fs.existsSync(
      filePath
    )
  ) {
    return false;
  }

  const stat =
    fs.statSync(
      filePath
    );

  if (!stat.isFile()) {
    return false;
  }

  const types = {
    ".html":
      "text/html; charset=utf-8",

    ".css":
      "text/css; charset=utf-8",

    ".js":
      "application/javascript; charset=utf-8",

    ".json":
      "application/json; charset=utf-8",

    ".png":
      "image/png",

    ".jpg":
      "image/jpeg",

    ".jpeg":
      "image/jpeg",

    ".svg":
      "image/svg+xml",

    ".ico":
      "image/x-icon",

    ".webp":
      "image/webp",
  };

  res.writeHead(
    200,
    {
      "Content-Type":
        types[
          path.extname(
            filePath
          ).toLowerCase()
        ] ||
        "application/octet-stream",
    }
  );

  fs.createReadStream(
    filePath
  ).pipe(res);

  return true;
}

/* ============================================================
 * MAIN SERVER
 * ============================================================ */

const server =
  http.createServer(
    async (req, res) => {
      /*
       * CORS
       */

      res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
      );

      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
      );

      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
      );

      /*
       * OPTIONS / CORS preflight
       */

      if (
        req.method ===
        "OPTIONS"
      ) {
        res.writeHead(
          204
        );

        return res.end();
      }

      /*
       * Parse URL
       */

      let url;

      try {
        url = new URL(
          req.url,
          `http://localhost:${PORT}`
        );
      } catch (error) {
        return sendJson(
          res,
          400,
          {
            success: false,
            message:
              "Invalid request URL.",
          }
        );
      }

      const pathname =
        url.pathname;

      const searchParams =
        url.searchParams;

      /* ======================================================
       * HEALTH
       * ====================================================== */

      if (
        req.method ===
          "GET" &&
        pathname ===
          "/api/health"
      ) {
        return sendJson(
          res,
          200,
          {
            success: true,

            message:
              "MAUSAM+ backend is running.",
          }
        );
      }

      /* ======================================================
       * WEATHER
       * ====================================================== */

      if (
        req.method ===
          "GET" &&
        pathname ===
          "/api/weather"
      ) {
        return handleWeatherByCity(
          searchParams,
          res
        );
      }

      /* ======================================================
       * WEATHER BY LOCATION
       * ====================================================== */

      if (
        req.method ===
          "GET" &&
        pathname ===
          "/api/weather/location"
      ) {
        return handleWeatherByLocation(
          searchParams,
          res
        );
      }

      /* ======================================================
       * ALERTS
       * ====================================================== */

      if (
        req.method ===
          "GET" &&
        pathname ===
          "/api/alerts/location"
      ) {
        return handleAlertsByLocation(
          searchParams,
          res
        );
      }

      /* ======================================================
       * DESTINATIONS
       * ====================================================== */

      if (
        req.method ===
          "GET" &&
        pathname ===
          "/api/destinations/weather"
      ) {
        return handleDestinationsWeather(
          searchParams,
          res
        );
      }

      /* ======================================================
       * CONTACT FORM - SAVE
       * ====================================================== */

      if (
        req.method ===
          "POST" &&
        pathname ===
          "/api/contact"
      ) {
        return handleContact(
          req,
          res
        );
      }

      /* ======================================================
       * CONTACT MESSAGES - READ
       * ====================================================== */

      if (
        req.method ===
          "GET" &&
        pathname ===
          "/api/contact/messages"
      ) {
        return handleGetContactMessages(
          req,
          res
        );
      }

      /* ======================================================
       * STATIC FILES
       * ====================================================== */

      if (
        req.method ===
          "GET" &&
        !pathname.startsWith(
          "/api/"
        )
      ) {
        if (
          serveStatic(
            pathname,
            res
          )
        ) {
          return;
        }
      }

      /* ======================================================
       * 404
       * ====================================================== */

      return sendJson(
        res,
        404,
        {
          success: false,
          message:
            "Not found.",
        }
      );
    }
  );

/* ============================================================
 * START SERVER
 * ============================================================ */

server.listen(
  PORT, '0.0.0.0',
  () => {
    console.log(
      `MAUSAM+ is running at http://localhost:${PORT}`
    );

    console.log(
      `Try: http://localhost:${PORT}/api/weather?city=London`
    );

    console.log(
      `Contact messages: http://localhost:${PORT}/api/contact/messages`
    );
  }
);
