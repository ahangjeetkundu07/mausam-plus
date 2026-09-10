// =========================================================
// MAUSAM+ NAVIGATION
// =========================================================

const navLinks = document.querySelectorAll(".nav-link");

navLinks.forEach((link) => {
    link.addEventListener("click", function () {

        navLinks.forEach((nav) => {
            nav.classList.remove("active");
        });

        this.classList.add("active");
    });
});


// =========================================================
// MAUSAM+ DOM ELEMENTS
// =========================================================

const myLocationBtn = document.getElementById("myLocationBtn");

const weatherLocation =
    document.getElementById("weatherLocation");

const weatherUpdated =
    document.getElementById("weatherUpdated");

const locationInput =
    document.getElementById("locationInput");

const searchWeatherBtn =
    document.getElementById("searchWeatherBtn");
    const weatherSearchStatus =
    document.getElementById("weatherSearchStatus");

const defaultSearchButtonLabel =
    searchWeatherBtn?.textContent.trim() || "Search";

const defaultLocationButtonLabel =
    myLocationBtn?.textContent.trim() || "📍 My Location";

let weatherRequestId = 0;
let activeWeatherController = null;

function setWeatherSearchStatus(message, isError = false) {

    if (!weatherSearchStatus) {
        return;
    }

    weatherSearchStatus.textContent = message || "";
    weatherSearchStatus.hidden = !message;
    weatherSearchStatus.classList.toggle("is-error", isError);
}

function setWeatherControls(isLoading, source = "") {

    if (searchWeatherBtn) {
        searchWeatherBtn.disabled = isLoading;
        searchWeatherBtn.textContent =
            isLoading && source === "search"
                ? "Searching…"
                : defaultSearchButtonLabel;
    }

    if (myLocationBtn) {
        myLocationBtn.disabled = isLoading;
        myLocationBtn.textContent =
            isLoading && source === "location"
                ? "Locating…"
                : defaultLocationButtonLabel;
    }
}

function beginWeatherRequest(source, message) {

    weatherRequestId += 1;

    if (activeWeatherController) {
        activeWeatherController.abort();
    }

    activeWeatherController = new AbortController();

    setWeatherControls(true, source);
    setWeatherSearchStatus(message);

    return {
        id: weatherRequestId,
        signal: activeWeatherController.signal
    };
}

function isCurrentWeatherRequest(requestId) {
    return requestId === weatherRequestId;
}

function finishWeatherRequest(requestId) {

    if (!isCurrentWeatherRequest(requestId)) {
        return;
    }

    activeWeatherController = null;
    setWeatherControls(false);
}

const personaTabs =
    document.getElementById("personaTabs");

const personaPanel =
    document.getElementById("personaPanel");


// =========================================================
// MAUSAM+ WEATHER API BASE URL
// =========================================================

// Serve the page through server.js for a same-origin production setup.
// Retain the local backend fallback when someone opens index.html directly.
const API_BASE_URL = "https://mausam-plus-backend.onrender.com";


// =========================================================
// MAUSAM+ SHARED STATE
//
// The persona ("For You") panel and the saved-destinations
// widget both re-use the same weather payload that Current
// Weather already loaded, instead of firing their own request.
// =========================================================
let lastWeatherData = null;
let activePersona = "health";
let activeForYouProfile = "health";


// =========================================================
// WEATHER CODE → DESCRIPTION + ICON
// =========================================================

function getWeatherDescription(code) {

    if (code === 0) {
        return {
            condition: "Clear Sky",
            icon: "☀️"
        };
    }

    if (code === 1) {
        return {
            condition: "Mainly Clear",
            icon: "🌤️"
        };
    }

    if (code === 2) {
        return {
            condition: "Partly Cloudy",
            icon: "⛅"
        };
    }

    if (code === 3) {
        return {
            condition: "Overcast",
            icon: "☁️"
        };
    }

    if (code === 45 || code === 48) {
        return {
            condition: "Foggy",
            icon: "🌫️"
        };
    }

    if (code >= 51 && code <= 57) {
        return {
            condition: "Drizzle",
            icon: "🌦️"
        };
    }

    if (code >= 61 && code <= 67) {
        return {
            condition: "Rain",
            icon: "🌧️"
        };
    }

    if (code >= 71 && code <= 77) {
        return {
            condition: "Snow",
            icon: "🌨️"
        };
    }

    if (code >= 80 && code <= 82) {
        return {
            condition: "Rain Showers",
            icon: "🌦️"
        };
    }

    if (code >= 95 && code <= 99) {
        return {
            condition: "Thunderstorm",
            icon: "⛈️"
        };
    }

    return {
        condition: "Unknown",
        icon: "🌤️"
    };
}


// =========================================================
// FORMAT TIME
// =========================================================

function formatTime(dateTime) {

    if (!dateTime) {
        return "--:--";
    }

    const date = new Date(dateTime);

    if (isNaN(date.getTime())) {
        return "--:--";
    }

    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}


// =========================================================
// UPDATE ELEMENT SAFELY
// =========================================================

function updateElement(id, value) {

    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}


// =========================================================
// FIND CLOSEST HOURLY DATA
// =========================================================

function getClosestHourlyIndex(hourly, currentTime) {

    if (
        !hourly ||
        !hourly.time ||
        !hourly.time.length ||
        !currentTime
    ) {
        return -1;
    }

    let closestIndex = 0;
    let smallestDifference = Infinity;

    const currentTimestamp =
        new Date(currentTime).getTime();

    hourly.time.forEach((time, index) => {

        const timestamp =
            new Date(time).getTime();

        const difference =
            Math.abs(timestamp - currentTimestamp);

        if (difference < smallestDifference) {

            smallestDifference = difference;
            closestIndex = index;

        }
    });

    return closestIndex;
}


// =========================================================
// UPDATE VISIBILITY
// =========================================================

function updateVisibility(hourly, currentTime) {

    if (
        !hourly ||
        !hourly.visibility ||
        !hourly.time
    ) {
        return;
    }

    const closestIndex =
        getClosestHourlyIndex(
            hourly,
            currentTime
        );

    if (closestIndex === -1) {
        return;
    }

    const visibilityMeters =
        hourly.visibility[closestIndex];

    if (
        visibilityMeters !== null &&
        visibilityMeters !== undefined
    ) {

        updateElement(
            "visibility",
            (visibilityMeters / 1000).toFixed(1) +
            " km"
        );
    }
}


// =========================================================
// UPDATE CURRENT WEATHER UI
// =========================================================

function updateCurrentWeather(data) {

    if (!data || !data.current) {
        return;
    }

    const current = data.current;


    // Temperature
    if (
        current.temperature_2m !== null &&
        current.temperature_2m !== undefined
    ) {

        updateElement(
            "temperatureValue",
            Math.round(current.temperature_2m) + "°"
        );
    }


    // Feels like
    if (
        current.apparent_temperature !== null &&
        current.apparent_temperature !== undefined
    ) {

        updateElement(
            "feelsLike",
            Math.round(
                current.apparent_temperature
            ) + "°C"
        );
    }


    // Humidity
    if (
        current.relative_humidity_2m !== null &&
        current.relative_humidity_2m !== undefined
    ) {

        updateElement(
            "humidity",
            current.relative_humidity_2m + "%"
        );
    }


    // Wind speed
    if (
        current.wind_speed_10m !== null &&
        current.wind_speed_10m !== undefined
    ) {

        updateElement(
            "windSpeed",
            (
                current.wind_speed_10m * 3.6
            ).toFixed(1) + " km/h"
        );
    }


    // Pressure
    if (
        current.surface_pressure !== null &&
        current.surface_pressure !== undefined
    ) {

        updateElement(
            "pressure",
            Number(
                current.surface_pressure
            ).toFixed(0) + " hPa"
        );
    }


    // Visibility
    updateVisibility(
        data.hourly,
        current.time
    );


    // Weather condition
    const weatherInfo =
        getWeatherDescription(
            current.weather_code
        );

    updateElement(
        "weatherCondition",
        weatherInfo.condition
    );

    updateElement(
        "weatherIcon",
        weatherInfo.icon
    );


    // Sunrise / Sunset
    if (data.daily) {

        if (
            data.daily.sunrise &&
            data.daily.sunrise.length
        ) {

            updateElement(
                "sunrise",
                formatTime(
                    data.daily.sunrise[0]
                )
            );
        }


        if (
            data.daily.sunset &&
            data.daily.sunset.length
        ) {

            updateElement(
                "sunset",
                formatTime(
                    data.daily.sunset[0]
                )
            );
        }
    }
}


// =========================================================
// UPDATE 7-DAY FORECAST
// =========================================================

function updateForecast(daily, location = null) {

    const forecastGrid =
        document.getElementById("forecastGrid");

    const forecastDays =
        document.getElementById("forecastDays");


    if (!daily || !daily.time) {
        return;
    }

    updateTemperatureTrend(daily);


    // -----------------------------------------------------
    // FORECAST GRID VERSION
    // -----------------------------------------------------

    if (forecastGrid) {

        forecastGrid.innerHTML = "";

        const totalDays =
            Math.min(
                daily.time.length,
                7
            );


        for (let i = 0; i < totalDays; i++) {

            const date =
                new Date(
                    daily.time[i] + "T00:00:00"
                );


            const dayName =
                i === 0
                    ? "TODAY"
                    : date.toLocaleDateString(
                        "en-US",
                        {
                            weekday: "short"
                        }
                    ).toUpperCase();


            const dayDate =
                date.toLocaleDateString(
                    "en-US",
                    {
                        day: "2-digit",
                        month: "short"
                    }
                ).toUpperCase();


            const weatherInfo =
                getWeatherDescription(
                    daily.weather_code[i]
                );


            const maxTemp =
                Math.round(
                    daily.temperature_2m_max[i]
                );


            const minTemp =
                Math.round(
                    daily.temperature_2m_min[i]
                );


            const rain =
                daily.precipitation_probability_max?.[i] ??
                0;


            const forecastDay =
                document.createElement("div");


            forecastDay.className =
                "forecast-day" +
                (i === 0 ? " today" : "");


            forecastDay.innerHTML = `
                <div class="day-name">
                    ${dayName}
                </div>

                <div class="day-date">
                    ${dayDate}
                </div>

                <div class="forecast-icon">
                    ${weatherInfo.icon}
                </div>

                <div class="forecast-condition">
                    ${weatherInfo.condition}
                </div>

                <div class="forecast-temperature">
                    <strong>${maxTemp}°</strong>
                    <span>${minTemp}°</span>
                </div>

                <div class="rain-probability">
                    💧 ${rain}%
                </div>
            `;


            forecastGrid.appendChild(
                forecastDay
            );
        }
    }


    // -----------------------------------------------------
    // FORECAST DAYS VERSION
    // -----------------------------------------------------

    if (forecastDays) {

        forecastDays.innerHTML = "";

        const totalDays =
            Math.min(
                daily.time.length,
                7
            );


        for (let i = 0; i < totalDays; i++) {

            const date =
                new Date(
                    daily.time[i] + "T00:00:00"
                );


            const dayName =
                i === 0
                    ? "TODAY"
                    : date.toLocaleDateString(
                        "en-US",
                        {
                            weekday: "short"
                        }
                    ).toUpperCase();


            const weatherInfo =
                getWeatherDescription(
                    daily.weather_code[i]
                );


            const maxTemp =
                Math.round(
                    daily.temperature_2m_max[i]
                );


            const minTemp =
                Math.round(
                    daily.temperature_2m_min[i]
                );


            const rain =
                daily.precipitation_probability_max?.[i] ??
                0;


            const card = document.createElement("article");
            card.className = "forecast-day" + (i === 0 ? " today" : "");
            card.setAttribute("aria-label", `${dayName}: ${weatherInfo.condition}, high ${maxTemp} degrees, low ${minTemp} degrees, ${rain}% chance of rain`);

            card.innerHTML = `
                <div class="forecast-day-top">
                    <span class="day-name">${dayName}</span>
                    <span class="day-date">${date.toLocaleDateString("en-US", { day: "numeric", month: "short" })}</span>
                </div>
                <div class="forecast-icon" aria-hidden="true">${weatherInfo.icon}</div>
                <div class="forecast-condition">${weatherInfo.condition}</div>
                <div class="forecast-temperature"><strong>${maxTemp}°</strong><span>${minTemp}°</span></div>
                <div class="rain-probability"><span>💧 Rain</span><strong>${rain}%</strong></div>
                <div class="rain-meter" aria-hidden="true"><i style="width: ${Math.min(100, Math.max(0, Number(rain) || 0))}%"></i></div>
            `;


            forecastDays.appendChild(
                card
            );
        }
    }
}


// =========================================================
// UPDATE LIVE TEMPERATURE TREND
// =========================================================

function updateTemperatureTrend(daily) {

    const highLine = document.getElementById("trendHighValues");
    const lowLine = document.getElementById("trendLowValues");

    if (!highLine || !lowLine || !daily?.temperature_2m_max || !daily?.temperature_2m_min) {
        return;
    }

    const days = Math.min(7, daily.temperature_2m_max.length, daily.temperature_2m_min.length);
    highLine.replaceChildren();
    lowLine.replaceChildren();

    for (let i = 0; i < days; i++) {
        const high = document.createElement("span");
        const low = document.createElement("span");
        high.textContent = `${Math.round(daily.temperature_2m_max[i])}°`;
        low.textContent = `${Math.round(daily.temperature_2m_min[i])}°`;
        highLine.appendChild(high);
        lowLine.appendChild(low);
    }
}


// =========================================================
// UPDATE LOCATION INFORMATION
// =========================================================

function updateWeatherLocation(data) {

    if (!data) {
        return;
    }


    if (
        data.location &&
        data.location.name
    ) {

        const name =
            data.location.name;

        const country =
            data.location.country ||
            "";


        updateElement(
            "weatherLocation",
            country
                ? `${name}, ${country}`
                : name
        );


        updateElement(
            "weatherUpdated",
            "Live weather data"
        );

        updateElement("forecastLocation", country ? `${name}, ${country}` : name);
        updateElement("alertsLocation", country ? `${name}, ${country}` : name);

        return;
    }


    if (
        data.latitude !== undefined &&
        data.longitude !== undefined
    ) {

        updateElement(
            "weatherLocation",
            "Your Current Location"
        );


        updateElement(
            "weatherUpdated",
            `Location detected • ${Number(
                data.latitude
            ).toFixed(2)}, ${Number(
                data.longitude
            ).toFixed(2)}`
        );

        updateElement("forecastLocation", "Your Current Location");
        updateElement("alertsLocation", "Your Current Location");
    }
}


// =========================================================
// PROCESS COMPLETE WEATHER DATA
// =========================================================

function processWeatherData(data) {

    if (!data) {
        throw new Error(
            "No weather data received"
        );
    }


    if (data.success === false) {

        throw new Error(
            data.message ||
            "Weather data unavailable"
        );
    }


    updateCurrentWeather(data);


    if (data.daily) {

        updateForecast(
            data.daily,
            data.location
        );
    }


    updateWeatherLocation(data);
    updateAlerts(data.alerts || [], data.location, data.alert_summary);

// Keep the payload available for both For You systems.
lastWeatherData = data;

// Update the visible For You section with live backend insights.
updateForYouProfile(activeForYouProfile);

// Keep the older persona panel working if it exists.
renderPersonaPanel(activePersona);

    console.log(
        "MAUSAM+ weather data processed successfully",
        data
    );
}


// =========================================================
// PERSONA ("FOR YOU") PANEL
// =========================================================
//
// Renders one card grid per persona from the weather payload's
// `insights` block. Every persona's numbers come straight from
// the backend — nothing here is invented client-side, except
// the saved-destinations list (which lives in localStorage,
// since there's no user login).

function formatPersonaTime(iso) {

    if (!iso) {
        return "--:--";
    }

    const date = new Date(iso);

    if (isNaN(date.getTime())) {
        return "--:--";
    }

    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}


function insightCard(icon, label, value, sub) {

    return `
        <div class="insight-card">
            <div class="insight-icon">${icon}</div>
            <div class="insight-body">
                <span class="insight-label">${label}</span>
                <strong class="insight-value">${value}</strong>
                ${sub ? `<p class="insight-sub">${sub}</p>` : ""}
            </div>
        </div>
    `;
}


function insightTip(text) {

    if (!text) {
        return "";
    }

    return `<div class="insight-tip">💡 ${text}</div>`;
}


function insightNote(text) {

    if (!text) {
        return "";
    }

    return `<div class="insight-data-note">ℹ️ ${text}</div>`;
}


function noInsightsPlaceholder() {

    return `
        <p class="insights-loading">
            Load a location above to see your personalized insights.
        </p>
    `;
}


// ---------------------------------------------------------
// PER-PERSONA CARD BUILDERS
// ---------------------------------------------------------

function renderHealthPersona(insights) {

    const pollen = insights.pollen || {};

    return `
        <div class="insight-grid">
            ${insightCard("🌫️", "Air Quality (US AQI)", insights.aqi ?? "--", insights.aqi_label)}
            ${insightCard("🌾", "Grass Pollen", pollen.grass?.label ?? "No data", pollen.grass?.value != null ? `Index ${Math.round(pollen.grass.value)}` : "")}
            ${insightCard("🌳", "Tree (Birch) Pollen", pollen.birch?.label ?? "No data", pollen.birch?.value != null ? `Index ${Math.round(pollen.birch.value)}` : "")}
            ${insightCard("🌼", "Ragweed Pollen", pollen.ragweed?.label ?? "No data", pollen.ragweed?.value != null ? `Index ${Math.round(pollen.ragweed.value)}` : "")}
            ${insightCard("☀️", "UV Index", insights.uv_index != null ? Math.round(insights.uv_index) : "--", insights.uv_label)}
            ${insightCard("💧", "Humidity", insights.humidity != null ? insights.humidity + "%" : "--", "")}
        </div>
        ${insightTip(insights.tip)}
    `;
}


function renderFitnessPersona(insights) {

    return `
        <div class="insight-grid">
            ${insightCard("🌅", "Sunrise", formatPersonaTime(insights.sunrise), "")}
            ${insightCard("🌇", "Sunset", formatPersonaTime(insights.sunset), "")}
            ${insightCard("🏃", "Best Running Window", insights.best_running_window ?? "--", "Coolest, calmest stretch today")}
            ${insightCard("💨", "Wind Speed", insights.wind_speed_kmh != null ? insights.wind_speed_kmh + " km/h" : "--", "")}
            ${insightCard("☀️", "UV Exposure", insights.uv_label ?? "--", "")}
            ${insightCard("🌡️", "Heat Alert", insights.heat_alert ? "Active" : "None", insights.heat_alert ? "Feels-like ≥ 32°C" : "Feels-like is comfortable")}
        </div>
        ${insightTip(insights.tip)}
    `;
}


function renderBeachPersona(insights) {

    if (!insights.available) {

        return `
            <p class="insights-loading">
                This location doesn't look coastal — no marine/sea data is available here.
            </p>
        `;
    }

    return `
        <div class="insight-grid">
            ${insightCard("🌊", "Wave Height", insights.wave_height_m != null ? insights.wave_height_m.toFixed(1) + " m" : "--", insights.condition_label)}
            ${insightCard("🌡️", "Sea Temperature", insights.sea_surface_temperature_c != null ? Math.round(insights.sea_surface_temperature_c) + "°C" : "--", "")}
            ${insightCard("☀️", "UV Index", insights.uv_index != null ? Math.round(insights.uv_index) : "--", insights.uv_label)}
            ${insightCard("🌙", "Tide Times", "Not available", "")}
        </div>
        ${insightNote(insights.tide_note)}
        ${insightTip(insights.tip)}
    `;
}


function renderTravelPersona(insights, location) {

    const tips = (insights.packing_suggestions || [])
        .map((tip) => `<li>${tip}</li>`)
        .join("");

    return `
        <div class="insight-grid">
            ${insightCard("🌧️", "Rain Delay Risk", (insights.rain_delay_risk_percent ?? 0) + "%", "Chance today")}
            ${insightCard("✈️", "Flight Disruption Risk", insights.flight_disruption_risk ?? "--", "Based on today's forecast")}
        </div>
        <div class="insight-packing">
            <h4>Packing Suggestions${location?.name ? " — " + location.name : ""}</h4>
            <ul>${tips}</ul>
        </div>
        <div class="destinations-widget" id="destinationsWidget">
            <h4>Saved Destinations</h4>
            <div class="destination-add-row">
                <input type="text" id="destinationInput" placeholder="Add a city, e.g. Tokyo">
                <button type="button" id="destinationAddBtn">Add</button>
            </div>
            <div class="destination-list" id="destinationList">
                <p class="insights-loading">No saved destinations yet — add one above.</p>
            </div>
        </div>
    `;
}


function renderFamilyPersona(insights) {

    return `
        <div class="insight-grid">
            ${insightCard("🌧️", "Rain Probability", (insights.rain_probability_percent ?? 0) + "%", "Today")}
            ${insightCard("🚸", "School Commute Caution", insights.school_commute_caution ?? "--", "")}
            ${insightCard("⚠️", "Severe Weather Day", insights.severe_weather_day ? new Date(insights.severe_weather_day + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" }) : "None this week", "")}
        </div>
        ${insightTip(insights.tip)}
    `;
}


function renderAgriculturePersona(insights) {

    return `
        <div class="insight-grid">
            ${insightCard("🌧️", "Rainfall (3 days)", insights.rainfall_3day_mm + " mm", "")}
            ${insightCard("🌧️", "Rainfall (7 days)", insights.rainfall_7day_mm + " mm", "")}
            ${insightCard("🌱", "Soil Moisture Estimate", insights.soil_moisture_estimate ?? "--", "")}
            ${insightCard("❄️", "Frost Risk", insights.frost_risk_day ? insights.frost_risk_day : "None this week", "")}
            ${insightCard("🌾", "Planting Conditions", insights.planting_favorable ? "Favorable" : "Marginal", "")}
        </div>
        ${insightTip(insights.planting_tip)}
    `;
}


function renderCommutePersona(insights) {

    return `
        <div class="insight-grid">
            ${insightCard("👁️", "Visibility", insights.visibility_km != null ? insights.visibility_km + " km" : "--", "")}
            ${insightCard("🌧️", "Rain (next 6h)", (insights.rain_next_6h_percent ?? 0) + "%", "")}
            ${insightCard("🌫️", "Fog Risk (next 6h)", insights.fog_risk_next_6h ? "Yes" : "No", "")}
            ${insightCard("🚦", "Travel Caution Level", insights.caution_level ?? "--", "")}
        </div>
        ${insightNote(insights.traffic_note)}
    `;
}


function renderEventsPersona(insights) {

    const days = (insights.extended_forecast || []).slice(0, 7);

    const rows = days.map((day) => {

        const date = new Date(day.date + "T00:00:00");

        const label = date.toLocaleDateString("en-US", { weekday: "short" });

        return `
            <div class="events-day">
                <span>${label}</span>
                <strong>${day.rain_probability_percent}%</strong>
                <small>${day.high_c}° / ${day.low_c}°</small>
            </div>
        `;
    }).join("");

    return `
        <div class="insight-grid">
            ${insightCard("😌", "Comfort Index", insights.comfort_index ? insights.comfort_index.score + "/100" : "--", insights.comfort_index ? insights.comfort_index.label : "")}
            ${insightCard("🌧️", "Rain Probability Today", (insights.rain_probability_percent ?? 0) + "%", "")}
        </div>
        <div class="events-forecast">
            <h4>Extended Rain Outlook</h4>
            <div class="events-days-row">${rows}</div>
        </div>
    `;
}


const PERSONA_RENDERERS = {
    health: (data) => renderHealthPersona(data.insights.health),
    fitness: (data) => renderFitnessPersona(data.insights.fitness),
    beach: (data) => renderBeachPersona(data.insights.beach),
    travel: (data) => renderTravelPersona(data.insights.travel, data.location),
    family: (data) => renderFamilyPersona(data.insights.family),
    garden: (data) => renderAgriculturePersona(data.insights.agriculture),
    commute: (data) => renderCommutePersona(data.insights.commute),
    events: (data) => renderEventsPersona(data.insights.events)
};


function renderPersonaPanel(persona) {

    if (!personaPanel) {
        return;
    }

    if (!lastWeatherData || !lastWeatherData.insights) {

        personaPanel.innerHTML = noInsightsPlaceholder();
        return;
    }

    const renderer = PERSONA_RENDERERS[persona];

    if (!renderer) {
        return;
    }

    personaPanel.innerHTML = renderer(lastWeatherData);

    // The Travelers panel rebuilds a fresh destinations widget
    // every render, so wire it up again each time.
    if (persona === "travel") {
        initDestinationsWidget();
    }
}


// ---------------------------------------------------------
// PERSONA TAB SWITCHING
// ---------------------------------------------------------

if (personaTabs) {

    const tabs = personaTabs.querySelectorAll(".persona-tab");

    tabs.forEach((tab) => {

        tab.addEventListener("click", function () {

            tabs.forEach((item) => item.classList.remove("active"));

            this.classList.add("active");

            activePersona = this.dataset.persona;

            renderPersonaPanel(activePersona);
        });
    });
}


// =========================================================
// SAVED DESTINATIONS (Travelers persona)
//
// Stored client-side in localStorage — there's no login system,
// so "saved" means "saved on this device/browser". Each render
// asks the backend for a compact weather + alert summary for
// every saved city in one request.
// =========================================================

const DESTINATIONS_KEY = "mausamplus_destinations";

function getSavedDestinations() {

    try {

        const raw = localStorage.getItem(DESTINATIONS_KEY);

        return raw ? JSON.parse(raw) : [];

    } catch (error) {

        console.error("Could not read saved destinations:", error);
        return [];
    }
}


function setSavedDestinations(list) {

    try {

        localStorage.setItem(DESTINATIONS_KEY, JSON.stringify(list));

    } catch (error) {

        console.error("Could not save destinations:", error);
    }
}


async function fetchDestinationsWeather(cities) {

    if (!cities.length) {
        return [];
    }

    const url =
        `${API_BASE_URL}/api/destinations/weather?cities=` +
        encodeURIComponent(cities.join(","));

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Destinations request failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.message || "Destinations unavailable");
    }

    return data.destinations || [];
}


function renderDestinationRows(container, results, cities) {

    if (!results.length) {

        container.innerHTML =
            '<p class="insights-loading">No saved destinations yet — add one above.</p>';

        return;
    }

    container.innerHTML = results.map((item) => {

        if (!item.success) {

            return `
                <div class="destination-row">
                    <span class="destination-name">${item.city}</span>
                    <span class="destination-error">Not found</span>
                    <button type="button" class="destination-remove" data-city="${item.city}">✕</button>
                </div>
            `;
        }

        const weatherInfo = getWeatherDescription(item.weather_code);

        const alertBadge =
            item.alert_count > 0
                ? `<span class="destination-alert">⚠️ ${item.alert_count} alert${item.alert_count > 1 ? "s" : ""}</span>`
                : `<span class="destination-clear">No alerts</span>`;

        return `
            <div class="destination-row">
                <span class="destination-icon">${weatherInfo.icon}</span>
                <div class="destination-info">
                    <span class="destination-name">${item.location}</span>
                    <span class="destination-meta">${Math.round(item.temperature_c)}° • Rain ${item.rain_probability_percent}%</span>
                </div>
                ${alertBadge}
                <button type="button" class="destination-remove" data-city="${item.city}">✕</button>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".destination-remove").forEach((btn) => {

        btn.addEventListener("click", function () {

            const city = this.dataset.city;

            const updated = getSavedDestinations().filter(
                (c) => c.toLowerCase() !== city.toLowerCase()
            );

            setSavedDestinations(updated);

            refreshDestinationsList();
        });
    });
}


async function refreshDestinationsList() {

    const container = document.getElementById("destinationList");

    if (!container) {
        return;
    }

    const cities = getSavedDestinations();

    if (!cities.length) {

        container.innerHTML =
            '<p class="insights-loading">No saved destinations yet — add one above.</p>';

        return;
    }

    container.innerHTML =
        '<p class="insights-loading">Loading your saved destinations...</p>';

    try {

        const results = await fetchDestinationsWeather(cities);

        renderDestinationRows(container, results, cities);

    } catch (error) {

        console.error("Destinations fetch error:", error);

        container.innerHTML =
            '<p class="insights-loading">Could not load destination weather right now.</p>';
    }
}


function initDestinationsWidget() {

    const input = document.getElementById("destinationInput");

    const addBtn = document.getElementById("destinationAddBtn");

    function addCurrentInput() {

        if (!input) {
            return;
        }

        const city = input.value.trim();

        if (!city) {
            return;
        }

        const cities = getSavedDestinations();

        if (cities.some((c) => c.toLowerCase() === city.toLowerCase())) {

            input.value = "";
            return;
        }

        cities.push(city);

        setSavedDestinations(cities);

        input.value = "";

        refreshDestinationsList();
    }

    if (addBtn) {

        addBtn.addEventListener("click", addCurrentInput);
    }

    if (input) {

        input.addEventListener("keydown", function (event) {

            if (event.key === "Enter") {

                event.preventDefault();

                addCurrentInput();
            }
        });
    }

    refreshDestinationsList();
}


// =========================================================
// DETECT USER LOCATION
// =========================================================

function detectUserLocation() {

    if (!navigator.geolocation) {

    setWeatherSearchStatus(
        "This browser does not support location detection. Search for a city instead.",
        true
    );

    updateAlerts(
        [],
        { name: "Location unavailable" },
        null,
        "This browser cannot determine your location. Search for a city to load weather guidance."
    );

    return;
}

    const request = beginWeatherRequest(
        "location",
        "Requesting your location…"
    );

    navigator.geolocation.getCurrentPosition(

        async function (position) {

            if (!isCurrentWeatherRequest(request.id)) {
                return;
            }

            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            try {

                setWeatherSearchStatus("Loading weather for your location…");

                const url =
                    `${API_BASE_URL}/api/weather/location` +
                    `?latitude=${encodeURIComponent(latitude)}` +
                    `&longitude=${encodeURIComponent(longitude)}`;

                const response = await fetch(url, {
                    signal: request.signal
                });

                if (!response.ok) {
                    throw new Error(
                        `Weather request failed (${response.status}).`
                    );
                }

                const data = await response.json();

                if (!data.success) {
                    throw new Error(
                        data.message ||
                        "Weather data is unavailable right now."
                    );
                }

                if (!isCurrentWeatherRequest(request.id)) {
                    return;
                }

                processWeatherData(data);

                updateElement(
                    "weatherUpdated",
                    `Location detected • ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`
                );

                setWeatherSearchStatus("Weather updated for your location.");

            } catch (error) {

                if (error.name !== "AbortError" &&
                    isCurrentWeatherRequest(request.id)) {

                    console.error("Weather error:", error);

                    setWeatherSearchStatus(
                        error.message ||
                        "Could not load weather for your location. Please try again.",
                        true
                    );
                    updateAlerts(
    [],
    { name: "Location unavailable" },
    null,
    "Weather guidance could not be loaded. Please try again shortly."
);
                }

            } finally {
                finishWeatherRequest(request.id);
            }
        },

        function (error) {

            if (!isCurrentWeatherRequest(request.id)) {
                return;
            }

            const message =
                error.code === error.PERMISSION_DENIED
                    ? "Location access was denied. Search for a city instead."
                    : "Your location could not be determined. Search for a city instead.";

            console.error("Location error:", error.message);

setWeatherSearchStatus(message, true);

updateAlerts(
    [],
    { name: "Location unavailable" },
    null,
    "Allow location access or search for a city to load weather guidance."
);

finishWeatherRequest(request.id);
        },

        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000
        }
    );
}


// =========================================================
// MY LOCATION BUTTON
// =========================================================

if (myLocationBtn) {

    myLocationBtn.addEventListener(
        "click",
        detectUserLocation
    );
}


// =========================================================
// WEATHER SEARCH
// =========================================================

async function searchWeather() {

    if (!locationInput) {
        return;
    }

    const city = locationInput.value.trim();

    if (!city) {
        locationInput.focus();

        setWeatherSearchStatus(
            "Enter a city or location to search.",
            true
        );

        return;
    }

    const request = beginWeatherRequest(
        "search",
        `Searching for ${city}…`
    );

    try {

        const url =
            `${API_BASE_URL}/api/weather?city=${encodeURIComponent(city)}`;

        const response = await fetch(url, {
            signal: request.signal
        });

        if (!response.ok) {
            throw new Error(
                `Weather request failed (${response.status}).`
            );
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(
                data.message ||
                `No weather data was found for ${city}.`
            );
        }

        if (!isCurrentWeatherRequest(request.id)) {
            return;
        }

        processWeatherData(data);

        setWeatherSearchStatus(
            `Weather updated for ${data.location?.name || city}.`
        );

    } catch (error) {

        if (error.name !== "AbortError" &&
            isCurrentWeatherRequest(request.id)) {

            console.error("Search weather error:", error);

            setWeatherSearchStatus(
                error.message ||
                "Could not load weather right now. Please try again.",
                true
            );
        }

    } finally {
        finishWeatherRequest(request.id);
    }
}


// =========================================================
// SEARCH BUTTON
// =========================================================

if (
    searchWeatherBtn &&
    locationInput
) {

    searchWeatherBtn.addEventListener(
        "click",
        searchWeather
    );


    locationInput.addEventListener(
        "keydown",
        function (event) {

            if (event.key === "Enter") {

                event.preventDefault();

                searchWeather();
            }
        }
    );
}



// =========================================================
// FETCH REAL ALERTS FROM BACKEND
// =========================================================

const activeAlertCard = document.getElementById("activeAlertCard");
const activeAlertTitle = document.getElementById("activeAlertTitle");
const activeAlertDescription = document.getElementById("activeAlertDescription");
const alertTime = document.getElementById("alertTime");
const alertArea = document.getElementById("alertArea");
const alertSeverityEl = activeAlertCard
    ? activeAlertCard.querySelector(".alert-severity")
    : null;

function updateAlerts(
    alerts,
    location = null,
    summary = null,
    errorMessage = ""
) {

    const safeAlerts = Array.isArray(alerts) ? alerts : [];
    const area = location?.name
        ? [location.name, location.country].filter(Boolean).join(", ")
        : "Your Current Location";
    const top = safeAlerts[0];
    const hasError = Boolean(errorMessage);
    const isClear = !top && !hasError;
    const alertIcon = document.getElementById("alertIcon");
    const alertStatus = document.getElementById("alertStatus");
    const alertsUpdated = document.getElementById("alertsUpdated");

    updateElement("alertsLocation", area);
    updateElement("alertArea", top?.area || area);
    if (activeAlertCard) {

    activeAlertCard.classList.remove(
        "is-clear",
        "is-unavailable",
        "is-low-risk",
        "is-moderate-risk",
        "is-high-risk"
    );

    if (hasError) {

        activeAlertCard.classList.add("is-unavailable");

    } else if (isClear) {

        activeAlertCard.classList.add("is-clear");

    } else {

        activeAlertCard.classList.add(
            `is-${(top.severity || "moderate risk")
                .toLowerCase()
                .replace(/\s+/g, "-")}`
        );
    }
    }
    if (hasError) {

    if (alertIcon) {
        alertIcon.textContent = "!";
    }

    if (alertStatus) {
        alertStatus.textContent =
            "● ALERT DATA UNAVAILABLE";
    }

    updateElement(
        "activeAlertTitle",
        "Could Not Check Local Alerts"
    );

    updateElement(
        "activeAlertDescription",
        errorMessage
    );

    updateElement("alertTime", "—");

    if (alertSeverityEl) {
        alertSeverityEl.textContent = "UNAVAILABLE";
    }

} else if (isClear) {

    if (alertIcon) {
        alertIcon.textContent = "✓";
    }

    if (alertStatus) {
        alertStatus.textContent =
            "● ALL CLEAR • LIVE FORECAST CHECK";
    }

    updateElement(
        "activeAlertTitle",
        "No Active Alerts"
    );

    updateElement(
        "activeAlertDescription",
        "No significant weather risks are currently detected for this location."
    );

    updateElement("alertTime", "—");

    if (alertSeverityEl) {
        alertSeverityEl.textContent = "NO RISK";
    }

} else {

    if (alertIcon) {
        alertIcon.textContent = top.icon || "⚠️";
    }

    if (alertStatus) {
        alertStatus.textContent =
            "● WEATHER RISK DETECTED • LIVE FORECAST";
    }

    updateElement(
        "activeAlertTitle",
        top.title || "Weather Alert"
    );

    updateElement(
        "activeAlertDescription",
        top.description ||
        "Check local conditions before travelling."
    );

    updateElement(
        "alertTime",
        top.time || "Today"
    );

    if (alertSeverityEl) {
        alertSeverityEl.textContent =
            top.severity || "CAUTION";
    }
}

    if (alertsUpdated) {
        const updatedAt = summary?.generated_at || top?.generated_at;
        const readableTime = updatedAt
            ? new Date(updatedAt).toLocaleString([], { hour: "numeric", minute: "2-digit", weekday: "short" })
            : "just now";
        alertsUpdated.innerHTML = `<span>●</span> ${
    hasError
        ? "Could not update alert guidance"
        : `Forecast-derived guidance updated ${readableTime}`
}`;
    }

    const categories = document.getElementById("alertCategories");
    if (!categories) return;
    categories.replaceChildren();
    categories.setAttribute("aria-busy", "false");

    const cards = hasError
    ? [{
        title: "Alert data unavailable",
        description:
            "Try again after checking your connection.",
        severity: "UNAVAILABLE",
        category: "conditions",
    }]
    : safeAlerts.length
        ? safeAlerts
        : [{
            title: "All clear",
            description:
                "No derived severe-weather risks",
            severity: "SAFE",
            category: "conditions",
        }];

    cards.slice(0, 4).forEach((alert) => {
        const card = document.createElement("article");
        card.className = "alert-category-card live-alert-card";

        const icon = document.createElement("div");
        icon.className = "category-icon";
        icon.textContent =
    alert.category === "thunderstorm" ? "⛈️" :
    alert.category === "rain" ? "🌧️" :
    alert.category === "heat" ? "🌡️" :
    alert.category === "wind" ? "💨" :
    alert.category === "fog" ? "🌫️" :
    alert.severity === "UNAVAILABLE" ? "!" :
    "✓";

        const info = document.createElement("div");
        info.className = "category-info";
        const label = document.createElement("span");
        label.textContent = (alert.category || "conditions").toUpperCase();
        const title = document.createElement("h3");
        title.textContent = alert.title;
        const description = document.createElement("p");
        description.textContent = alert.description;
        info.append(label, title, description);

        const status = document.createElement("div");
        const severityClass = (alert.severity || "SAFE")
    .toLowerCase()
    .replace(/\s+/g, "-");

status.className =
    `category-status severity-${severityClass}`;
        status.textContent = alert.severity || "SAFE";
        card.append(icon, info, status);
        categories.appendChild(card);
    });
}



// =========================================================
// MAUSAM+ SATELLITE / WEATHER MAP
// =========================================================

const satelliteLocation =
    document.getElementById(
        "satelliteLocation"
    );


const weatherMap =
    document.getElementById(
        "weatherMap"
    );


const userMapMarker =
    document.getElementById(
        "userMapMarker"
    );


const zoomInBtn =
    document.getElementById(
        "zoomInBtn"
    );


const zoomOutBtn =
    document.getElementById(
        "zoomOutBtn"
    );


const resetMapBtn =
    document.getElementById(
        "resetMapBtn"
    );


const mapLayers =
    document.querySelectorAll(
        ".map-layer"
    );


// =========================================================
// SATELLITE LOCATION
// =========================================================

function detectSatelliteLocation() {

    if (!satelliteLocation) {
        return;
    }


    if (!navigator.geolocation) {

        satelliteLocation.textContent =
            "Location unavailable";

        return;
    }


    navigator.geolocation.getCurrentPosition(

        function (position) {

            const latitude =
                position.coords.latitude;

            const longitude =
                position.coords.longitude;


            satelliteLocation.textContent =
                `Current Location • ${latitude.toFixed(
                    2
                )}, ${longitude.toFixed(2)}`;


            console.log(
                "Satellite location:",
                latitude,
                longitude
            );


            // -------------------------------------------------
            // OPTIONAL USER MAP MARKER
            // -------------------------------------------------

            if (userMapMarker) {

                /*
                 * If your map uses percentage-based positioning,
                 * the marker can be positioned here.
                 *
                 * Actual geographic map positioning should
                 * eventually be handled by a map library/API.
                 */
            }
        },


        function (error) {

            console.error(
                "Satellite location error:",
                error.message
            );


            satelliteLocation.textContent =
                "Location access unavailable";
        },

        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000
        }
    );
}


detectSatelliteLocation();


// =========================================================
// MAP ZOOM
// =========================================================

let mapZoom = 1;

let mapZoomContent =
    document.querySelector(
        ".map-zoom-content"
    );


if (
    weatherMap &&
    !mapZoomContent
) {

    mapZoomContent =
        document.createElement("div");


    mapZoomContent.className =
        "map-zoom-content";


    while (
        weatherMap.firstChild
    ) {

        mapZoomContent.appendChild(
            weatherMap.firstChild
        );
    }


    weatherMap.appendChild(
        mapZoomContent
    );
}


// =========================================================
// UPDATE MAP ZOOM
// =========================================================

function updateMapZoom() {

    if (!mapZoomContent) {
        return;
    }


    mapZoomContent.style.transform =
        `scale(${mapZoom})`;
}


// =========================================================
// ZOOM IN
// =========================================================

if (zoomInBtn) {

    zoomInBtn.addEventListener(
        "click",
        function () {

            if (mapZoom < 1.5) {

                mapZoom =
                    Math.min(
                        1.5,
                        Number(
                            (
                                mapZoom + 0.1
                            ).toFixed(1)
                        )
                    );


                updateMapZoom();
            }
        }
    );
}


// =========================================================
// ZOOM OUT
// =========================================================

if (zoomOutBtn) {

    zoomOutBtn.addEventListener(
        "click",
        function () {

            if (mapZoom > 0.8) {

                mapZoom =
                    Math.max(
                        0.8,
                        Number(
                            (
                                mapZoom - 0.1
                            ).toFixed(1)
                        )
                    );


                updateMapZoom();
            }
        }
    );
}


// =========================================================
// RESET MAP
// =========================================================

if (resetMapBtn) {

    resetMapBtn.addEventListener(
        "click",
        function () {

            mapZoom = 1;

            updateMapZoom();
        }
    );
}


// =========================================================
// MAP LAYERS
// =========================================================

mapLayers.forEach(
    function (layer) {

        layer.addEventListener(
            "click",
            function () {

                mapLayers.forEach(
                    function (item) {

                        item.classList.remove(
                            "active"
                        );
                    }
                );


                this.classList.add(
                    "active"
                );


                const selectedLayer =
                    this.dataset.layer;


                console.log(
                    "Selected weather layer:",
                    selectedLayer
                );


                /*
                 * FUTURE BACKEND / MAP INTEGRATION
                 *
                 * The selected layer will eventually
                 * control real weather-map data.
                 *
                 * Examples:
                 *
                 * radar
                 * satellite
                 * temperature
                 * precipitation
                 * wind
                 */
            }
        );
    }
);


// =========================================================
// MAUSAM+ CONTACT FORM
// =========================================================

const contactForm =
    document.getElementById(
        "contactForm"
    );


const contactSuccess =
    document.getElementById(
        "contactSuccess"
    );


if (contactForm) {

    contactForm.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            const name =
                document.getElementById(
                    "contactName"
                )?.value.trim() || "";


            const email =
                document.getElementById(
                    "contactEmail"
                )?.value.trim() || "";


            const subject =
                document.getElementById(
                    "contactSubject"
                )?.value.trim() || "";


            const message =
                document.getElementById(
                    "contactMessage"
                )?.value.trim() || "";


            // -------------------------------------------------
            // REQUIRED FIELD VALIDATION
            // -------------------------------------------------

            if (
                name === "" ||
                email === "" ||
                subject === "" ||
                message === ""
            ) {

                alert(
                    "Please fill in all the fields."
                );

                return;
            }


            // -------------------------------------------------
            // EMAIL VALIDATION
            // -------------------------------------------------

            const emailPattern =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


            if (
                !emailPattern.test(email)
            ) {

                alert(
                    "Please enter a valid email address."
                );

                return;
            }


            // -------------------------------------------------
            // SEND TO BACKEND
            // -------------------------------------------------

            const submitBtn =
                contactForm.querySelector(
                    ".contact-submit-btn"
                );

            if (submitBtn) {
                submitBtn.disabled = true;
            }

fetch(`${API_BASE_URL}/api/contact`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        name,
        email,
        subject,
        message
    })
})
    .then(async (response) => {

        const data = await response.json();

        console.log(
            "Contact form backend response:",
            data
        );

        // Backend rejected the submission
        if (!response.ok || !data.success) {
            throw new Error(
                data.message || "Unable to send your message."
            );
        }

        // ---------------------------------------------
        // SUCCESS
        // ---------------------------------------------

        if (contactSuccess) {
            contactSuccess.classList.add("show");
        }

        // Clear form ONLY after successful submission
        contactForm.reset();

        // Hide success message after 5 seconds
        setTimeout(() => {

            if (contactSuccess) {
                contactSuccess.classList.remove("show");
            }

        }, 5000);
    })
    .catch((error) => {

        console.error(
            "Contact form submit error:",
            error
        );

        // ---------------------------------------------
        // ERROR
        // ---------------------------------------------

        alert(
            error.message ||
            "Something went wrong. Please try again."
        );
    })
    .finally(() => {

        // Re-enable button whether request succeeds or fails
        if (submitBtn) {
            submitBtn.disabled = false;
        }
    });

                    // -------------------------------------------------
                    // SUCCESS MESSAGE
                    // -------------------------------------------------

                    if (contactSuccess) {

                        contactSuccess.classList.add(
                            "show"
                        );
                    }


                    // -------------------------------------------------
                    // CLEAR FORM
                    // -------------------------------------------------

                    contactForm.reset();


                    // -------------------------------------------------
                    // HIDE SUCCESS MESSAGE
                    // -------------------------------------------------

                    setTimeout(
                        function () {

                            if (contactSuccess) {

                                contactSuccess.classList.remove(
                                    "show"
                                );
                            }
                        },
                        5000
                    );
                });
        }

// =========================================================
// INITIALIZE MAUSAM+
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        console.log(
            "MAUSAM+ frontend initialized"
        );


        // Automatically detect user's weather
        detectUserLocation();

    }
);
// =========================================================
// NAVBAR SMOOTH SCROLL WITH OFFSET
// =========================================================

document.querySelectorAll(".nav-link").forEach(link => {

    link.addEventListener("click", function (event) {

        const targetId =
            this.getAttribute("href");

        if (
            !targetId ||
            !targetId.startsWith("#")
        ) {
            return;
        }

        const target =
            document.querySelector(targetId);

        if (!target) {
            return;
        }

        event.preventDefault();


        const navbar =
            document.querySelector(".navbar");

        const navbarHeight =
            navbar
                ? navbar.offsetHeight
                : 80;


        // Small breathing space below navbar
        const extraOffset = 15;


        const targetPosition =
            target.getBoundingClientRect().top +
            window.scrollY -
            navbarHeight -
            extraOffset;


        window.scrollTo({

            top: targetPosition,

            behavior: "smooth"

        });

    });

});
// =========================================================
// FOR YOU — PERSONALIZED WEATHER PROFILES
// =========================================================

const forYouProfiles = {

    // -----------------------------------------------------
    // HEALTH
    // -----------------------------------------------------

    health: {

        kicker:
            "HEALTH & WELLBEING",

        title:
            "Weather for your wellbeing",

        description:
            "Monitor environmental conditions that may affect your comfort and wellbeing.",

        metrics: [

            {
                icon: "🌫️",
                name: "AIR QUALITY",
                value: "--",
                label: "Awaiting AQI data"
            },

            {
                icon: "☀️",
                name: "UV INDEX",
                value: "--",
                label: "Awaiting UV data"
            },

            {
                icon: "💧",
                name: "HUMIDITY",
                value: "--",
                label: "Awaiting humidity data"
            },

            {
                icon: "🌼",
                name: "POLLEN",
                value: "--",
                label: "Awaiting pollen data"
            }

        ],

        recommendation:
            "MAUSAM+ will provide environmental guidance once live air-quality and related data are available."

    },


    // -----------------------------------------------------
    // FITNESS
    // -----------------------------------------------------

    fitness: {

        kicker:
            "OUTDOOR FITNESS",

        title:
            "Plan your workout around the weather",

        description:
            "Find suitable outdoor activity periods using temperature, wind, sunrise, sunset and heat conditions.",

        metrics: [

            {
                icon: "🌅",
                name: "SUNRISE",
                value: "--",
                label: "Awaiting data"
            },

            {
                icon: "🌇",
                name: "SUNSET",
                value: "--",
                label: "Awaiting data"
            },

            {
                icon: "💨",
                name: "WIND",
                value: "--",
                label: "Awaiting wind data"
            },

            {
                icon: "🏃",
                name: "BEST HOURS",
                value: "--",
                label: "Calculating"
            }

        ],

        recommendation:
            "Your best running hours will be calculated using temperature, rain probability, wind and heat conditions."

    },


    // -----------------------------------------------------
    // BEACH
    // -----------------------------------------------------

    beach: {

        kicker:
            "BEACH & MARINE",

        title:
            "Know the conditions before heading out",

        description:
            "Check marine conditions to make beach activities safer and more enjoyable.",

        metrics: [

            {
                icon: "🌊",
                name: "SEA CONDITIONS",
                value: "--",
                label: "Awaiting marine data"
            },

            {
                icon: "🌙",
                name: "NEXT TIDE",
                value: "--",
                label: "Awaiting tide data"
            },

            {
                icon: "〰️",
                name: "WAVE HEIGHT",
                value: "--",
                label: "Awaiting wave data"
            },

            {
                icon: "🌡️",
                name: "WATER TEMP",
                value: "--",
                label: "Awaiting water data"
            }

        ],

        recommendation:
            "Marine conditions, tide timings, wave height and water temperature will appear when marine data is available."

    },


    // -----------------------------------------------------
    // TRAVEL
    // -----------------------------------------------------

    travel: {

        kicker:
            "TRAVEL ASSISTANT",

        title:
            "Travel smarter with weather intelligence",

        description:
            "Get weather-aware travel information, severe weather warnings and packing suggestions.",

        metrics: [

            {
                icon: "📍",
                name: "DESTINATION",
                value: "--",
                label: "No destination saved"
            },

            {
                icon: "⚠️",
                name: "SEVERE WEATHER",
                value: "--",
                label: "Checking alerts"
            },

            {
                icon: "🧳",
                name: "PACKING",
                value: "--",
                label: "Awaiting forecast"
            },

            {
                icon: "✈️",
                name: "TRAVEL RISK",
                value: "--",
                label: "Awaiting data"
            }

        ],

        recommendation:
            "Add a destination to receive weather-aware travel information and packing suggestions."

    },


    // -----------------------------------------------------
    // FAMILY
    // -----------------------------------------------------

    family: {

        kicker:
            "FAMILY & PARENTS",

        title:
            "Make everyday family planning easier",

        description:
            "Stay aware of rain, severe weather and conditions that may affect school and daily commutes.",

        metrics: [

            {
                icon: "🏫",
                name: "SCHOOL COMMUTE",
                value: "--",
                label: "Awaiting conditions"
            },

            {
                icon: "🌧️",
                name: "RAIN",
                value: "--",
                label: "Awaiting forecast"
            },

            {
                icon: "⚠️",
                name: "WEATHER ALERT",
                value: "--",
                label: "Checking alerts"
            },

            {
                icon: "🕐",
                name: "BEST TIME",
                value: "--",
                label: "Calculating"
            }

        ],

        recommendation:
            "MAUSAM+ will highlight rain and severe weather conditions that could affect your family's daily routine."

    },


    // -----------------------------------------------------
    // AGRICULTURE
    // -----------------------------------------------------

    agriculture: {

        kicker:
            "AGRICULTURE & GARDEN",

        title:
            "Weather intelligence for plants and crops",

        description:
            "Use rainfall, soil conditions and frost information to make better gardening and agricultural decisions.",

        metrics: [

            {
                icon: "🌱",
                name: "SOIL MOISTURE",
                value: "--",
                label: "Awaiting soil data"
            },

            {
                icon: "🌧️",
                name: "RAINFALL",
                value: "--",
                label: "Forecast rainfall"
            },

            {
                icon: "❄️",
                name: "FROST RISK",
                value: "--",
                label: "Checking conditions"
            },

            {
                icon: "🌿",
                name: "PLANTING",
                value: "--",
                label: "Seasonal guidance"
            }

        ],

        recommendation:
            "Planting guidance will use local weather and seasonal conditions to provide useful recommendations."

    },


    // -----------------------------------------------------
    // COMMUTE
    // -----------------------------------------------------

    commute: {

        kicker:
            "DAILY COMMUTE",

        title:
            "Know what your journey may look like",

        description:
            "Combine weather conditions with visibility and travel-related alerts to plan your commute.",

        metrics: [

            {
                icon: "🚗",
                name: "ROAD CONDITIONS",
                value: "--",
                label: "Awaiting data"
            },

            {
                icon: "👁️",
                name: "VISIBILITY",
                value: "--",
                label: "Awaiting visibility"
            },

            {
                icon: "🌧️",
                name: "RAIN",
                value: "--",
                label: "Awaiting forecast"
            },

            {
                icon: "⚠️",
                name: "TRAVEL ALERT",
                value: "--",
                label: "Checking alerts"
            }

        ],

        recommendation:
            "Weather-related travel warnings will help you identify conditions that could affect your commute."

    },


    // -----------------------------------------------------
    // EVENTS
    // -----------------------------------------------------

    events: {

        kicker:
            "EVENT PLANNING",

        title:
            "Plan outdoor events with confidence",

        description:
            "Use extended forecasts, rain probability and comfort conditions when planning outdoor gatherings.",

        metrics: [

            {
                icon: "📅",
                name: "FORECAST",
                value: "--",
                label: "Awaiting forecast"
            },

            {
                icon: "🌧️",
                name: "RAIN CHANCE",
                value: "--",
                label: "Awaiting forecast"
            },

            {
                icon: "😊",
                name: "COMFORT",
                value: "--",
                label: "Calculating"
            },

            {
                icon: "⏱️",
                name: "BEST WINDOW",
                value: "--",
                label: "Calculating"
            }

        ],

        recommendation:
            "MAUSAM+ will identify suitable outdoor windows using temperature, rain probability, wind and humidity."

    }

};
// =========================================================
// FOR YOU — PROFILE SWITCHING
// =========================================================
function updateForYouProfile(profileName) {

    const profile = forYouProfiles[profileName];

    if (!profile) {
        return;
    }

    const insights = lastWeatherData?.insights || {};

    const health = insights.health || {};
    const fitness = insights.fitness || {};
    const beach = insights.beach || {};
    const travel = insights.travel || {};
    const family = insights.family || {};
    const agriculture = insights.agriculture || {};
    const commute = insights.commute || {};
    const events = insights.events || {};

    const kicker = document.getElementById("forYouKicker");
    const title = document.getElementById("forYouTitle");
    const description = document.getElementById("forYouDescription");
    const recommendation = document.getElementById("forYouRecommendation");

    if (kicker) {
        kicker.textContent = profile.kicker;
    }

    if (title) {
        title.textContent = profile.title;
    }

    if (description) {
        description.textContent = profile.description;
    }

    /*
     * Default to the existing static profile values.
     * These are replaced by backend values whenever
     * lastWeatherData.insights is available.
     */
    let metrics = profile.metrics.map(metric => ({
        icon: metric.icon,
        name: metric.name,
        value: metric.value,
        label: metric.label
    }));

    let recommendationText = profile.recommendation;

    // ---------------------------------------------------------
    // HEALTH
    // ---------------------------------------------------------

    if (profileName === "health") {

        const pollenValues = [
            health.pollen?.grass?.value,
            health.pollen?.birch?.value,
            health.pollen?.ragweed?.value
        ].filter(value =>
            value !== null &&
            value !== undefined &&
            Number.isFinite(Number(value))
        );

        const maxPollen = pollenValues.length
            ? Math.max(...pollenValues.map(Number))
            : null;

        metrics = [
            {
                icon: "🌫️",
                name: "AIR QUALITY",
                value:
                    health.aqi !== null &&
                    health.aqi !== undefined
                        ? Math.round(health.aqi)
                        : "--",
                label:
                    health.aqi_label ||
                    "AQI"
            },
            {
                icon: "☀️",
                name: "UV INDEX",
                value:
                    health.uv_index !== null &&
                    health.uv_index !== undefined
                        ? Math.round(health.uv_index)
                        : "--",
                label:
                    health.uv_label ||
                    "UV conditions"
            },
            {
                icon: "💧",
                name: "HUMIDITY",
                value:
                    health.humidity !== null &&
                    health.humidity !== undefined
                        ? `${Math.round(health.humidity)}%`
                        : "--",
                label:
                    "Relative humidity"
            },
            {
                icon: "🌼",
                name: "POLLEN",
                value:
                    maxPollen !== null
                        ? Math.round(maxPollen)
                        : "--",
                label:
                    maxPollen !== null
                        ? "Highest pollen index"
                        : "No pollen data"
            }
        ];

        recommendationText =
            health.tip ||
            profile.recommendation;
    }

    // ---------------------------------------------------------
    // FITNESS
    // ---------------------------------------------------------

    else if (profileName === "fitness") {

        metrics = [
            {
                icon: "🌅",
                name: "SUNRISE",
                value: formatForYouTime(fitness.sunrise),
                label: "Local time"
            },
            {
                icon: "🌇",
                name: "SUNSET",
                value: formatForYouTime(fitness.sunset),
                label: "Local time"
            },
            {
                icon: "💨",
                name: "WIND",
                value:
                    fitness.wind_speed_kmh !== null &&
                    fitness.wind_speed_kmh !== undefined
                        ? `${fitness.wind_speed_kmh} km/h`
                        : "--",
                label: "Current wind"
            },
            {
                icon: "🏃",
                name: "BEST WINDOW",
                value:
                    fitness.best_running_window ||
                    "Unavailable",
                label:
                    fitness.heat_alert
                        ? "Heat alert"
                        : "Running window"
            }
        ];

        recommendationText =
            fitness.tip ||
            profile.recommendation;
    }

    // ---------------------------------------------------------
    // BEACH
    // ---------------------------------------------------------

    else if (profileName === "beach") {

        metrics = [
            {
                icon: "🌊",
                name: "WAVE HEIGHT",
                value:
                    beach.wave_height_m !== null &&
                    beach.wave_height_m !== undefined
                        ? `${Number(beach.wave_height_m).toFixed(1)} m`
                        : "--",
                label:
                    beach.condition_label ||
                    "Wave conditions"
            },
            {
                icon: "🌡️",
                name: "SEA TEMP",
                value:
                    beach.sea_surface_temperature_c !== null &&
                    beach.sea_surface_temperature_c !== undefined
                        ? `${Math.round(beach.sea_surface_temperature_c)}°C`
                        : "--",
                label: "Sea surface temperature"
            },
            {
                icon: "☀️",
                name: "UV INDEX",
                value:
                    beach.uv_index !== null &&
                    beach.uv_index !== undefined
                        ? Math.round(beach.uv_index)
                        : "--",
                label:
                    beach.uv_label ||
                    "UV conditions"
            },
            {
                icon: "🌙",
                name: "TIDE",
                value: "Unavailable",
                label:
                    beach.tide_note ||
                    "No live tide data"
            }
        ];

        recommendationText =
            beach.tip ||
            profile.recommendation;
    }

    // ---------------------------------------------------------
    // TRAVEL
    // ---------------------------------------------------------

    else if (profileName === "travel") {

        const packingText =
            Array.isArray(travel.packing_suggestions) &&
            travel.packing_suggestions.length
                ? travel.packing_suggestions[0]
                : "No packing advice";

        metrics = [
            {
                icon: "🌧️",
                name: "RAIN DELAY",
                value:
                    travel.rain_delay_risk_percent !== null &&
                    travel.rain_delay_risk_percent !== undefined
                        ? `${travel.rain_delay_risk_percent}%`
                        : "--",
                label: "Chance today"
            },
            {
                icon: "✈️",
                name: "FLIGHT RISK",
                value:
                    travel.flight_disruption_risk ||
                    "--",
                label: "Forecast-based risk"
            },
            {
                icon: "🧳",
                name: "PACKING",
                value: packingText,
                label: "Weather-aware advice"
            },
            {
                icon: "🌦️",
                name: "TRAVEL WEATHER",
                value:
                    travel.rain_delay_risk_percent !== null &&
                    travel.rain_delay_risk_percent !== undefined
                        ? travel.rain_delay_risk_percent < 30
                            ? "Favorable"
                            : travel.rain_delay_risk_percent < 60
                                ? "Mixed"
                                : "Risky"
                        : "--",
                label: "Today's conditions"
            }
        ];

        recommendationText =
            packingText ||
            profile.recommendation;
    }

    // ---------------------------------------------------------
    // FAMILY
    // ---------------------------------------------------------

    else if (profileName === "family") {

        let severeDay = "None expected";

        if (family.severe_weather_day) {
            const date = new Date(
                `${family.severe_weather_day}T00:00:00`
            );

            if (!Number.isNaN(date.getTime())) {
                severeDay =
                    date.toLocaleDateString(
                        "en-US",
                        {
                            weekday: "short",
                            month: "short",
                            day: "numeric"
                        }
                    );
            } else {
                severeDay =
                    family.severe_weather_day;
            }
        }

        metrics = [
            {
                icon: "🌧️",
                name: "RAIN CHANCE",
                value:
                    family.rain_probability_percent !== null &&
                    family.rain_probability_percent !== undefined
                        ? `${family.rain_probability_percent}%`
                        : "--",
                label: "Today"
            },
            {
                icon: "🏫",
                name: "SCHOOL COMMUTE",
                value:
                    family.school_commute_caution ||
                    "--",
                label: "Weather-based caution"
            },
            {
                icon: "⚠️",
                name: "SEVERE WEATHER",
                value: severeDay,
                label: "Forecast"
            },
            {
                icon: "👨‍👩‍👧",
                name: "FAMILY ADVICE",
                value:
                    family.tip
                        ? "See advice"
                        : "--",
                label:
                    family.tip ||
                    "No additional advice"
            }
        ];

        recommendationText =
            family.tip ||
            profile.recommendation;
    }

    // ---------------------------------------------------------
    // AGRICULTURE
    // ---------------------------------------------------------

    else if (profileName === "agriculture") {

        metrics = [
            {
                icon: "🌧️",
                name: "RAINFALL",
                value:
                    agriculture.rainfall_3day_mm !== null &&
                    agriculture.rainfall_3day_mm !== undefined
                        ? `${agriculture.rainfall_3day_mm} mm`
                        : "--",
                label: "Next 3 days"
            },
            {
                icon: "🌧️",
                name: "7-DAY RAIN",
                value:
                    agriculture.rainfall_7day_mm !== null &&
                    agriculture.rainfall_7day_mm !== undefined
                        ? `${agriculture.rainfall_7day_mm} mm`
                        : "--",
                label: "Next 7 days"
            },
            {
                icon: "🌱",
                name: "SOIL MOISTURE",
                value:
                    agriculture.soil_moisture_estimate ||
                    "--",
                label: "Forecast estimate"
            },
            {
                icon: "🌾",
                name: "PLANTING",
                value:
                    agriculture.planting_favorable
                        ? "Favorable"
                        : "Marginal",
                label:
                    agriculture.planting_tip ||
                    "Planting conditions"
            }
        ];

        recommendationText =
            agriculture.planting_tip ||
            profile.recommendation;
    }

    // ---------------------------------------------------------
    // COMMUTE
    // ---------------------------------------------------------

    else if (profileName === "commute") {

        metrics = [
            {
                icon: "👁️",
                name: "VISIBILITY",
                value:
                    commute.visibility_km !== null &&
                    commute.visibility_km !== undefined
                        ? `${commute.visibility_km} km`
                        : "--",
                label: "Forecast visibility"
            },
            {
                icon: "🌧️",
                name: "RAIN NEXT 6H",
                value:
                    commute.rain_next_6h_percent !== null &&
                    commute.rain_next_6h_percent !== undefined
                        ? `${commute.rain_next_6h_percent}%`
                        : "--",
                label: "Rain probability"
            },
            {
                icon: "🌫️",
                name: "FOG RISK",
                value:
                    commute.fog_risk_next_6h
                        ? "Possible"
                        : "Low",
                label: "Next 6 hours"
            },
            {
                icon: "🚦",
                name: "CAUTION",
                value:
                    commute.caution_level ||
                    "--",
                label:
                    commute.traffic_note ||
                    "Travel guidance"
            }
        ];

        recommendationText =
            commute.traffic_note ||
            profile.recommendation;
    }

    // ---------------------------------------------------------
    // EVENTS
    // ---------------------------------------------------------

    else if (profileName === "events") {

        const comfort =
            events.comfort_index;

        metrics = [
            {
                icon: "😊",
                name: "COMFORT",
                value:
                    comfort &&
                    comfort.score !== null &&
                    comfort.score !== undefined
                        ? `${comfort.score}/100`
                        : "--",
                label:
                    comfort?.label ||
                    "Comfort index"
            },
            {
                icon: "🌧️",
                name: "RAIN CHANCE",
                value:
                    events.rain_probability_percent !== null &&
                    events.rain_probability_percent !== undefined
                        ? `${events.rain_probability_percent}%`
                        : "--",
                label: "Today"
            },
            {
                icon: "📅",
                name: "FORECAST DAYS",
                value:
                    Array.isArray(events.extended_forecast)
                        ? events.extended_forecast.length
                        : "--",
                label: "Days available"
            },
            {
                icon: "⏱️",
                name: "BEST WINDOW",
                value: "Unavailable",
                label: "No dedicated field in backend"
            }
        ];

        recommendationText =
            comfort?.label ||
            profile.recommendation;
    }

    // ---------------------------------------------------------
    // UPDATE THE FOUR VISIBLE CARDS
    // ---------------------------------------------------------

    metrics.forEach((metric, index) => {

        const number = index + 1;

        const metricCard =
            document.querySelectorAll(
                ".for-you-metric"
            )[index];

        if (!metricCard) {
            return;
        }

        const icon =
            metricCard.querySelector(
                ".for-you-metric-icon"
            );

        const name =
            metricCard.querySelector("small");

        const value =
            document.getElementById(
                `forYouMetric${number}`
            );

        const label =
            document.getElementById(
                `forYouMetric${number}Label`
            );

        if (icon) {
            icon.textContent =
                metric.icon;
        }

        if (name) {
            name.textContent =
                metric.name;
        }

        if (value) {
            value.textContent =
                metric.value;
        }

        if (label) {
            label.textContent =
                metric.label;
        }
    });

    if (recommendation) {
        recommendation.textContent =
            recommendationText;
    }
}
// =========================================================
// INITIALISE FOR YOU
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const tabs =
            document.querySelectorAll(
                ".for-you-tab"
            );


        tabs.forEach(tab => {

            tab.addEventListener(
                "click",
                () => {

                    const profileName =
    tab.dataset.profile || "health";

activeForYouProfile =
    profileName;


                    // -----------------------------
                    // Active tab
                    // -----------------------------

                    tabs.forEach(
                        otherTab => {

                            const active =
                                otherTab === tab;


                            otherTab.classList.toggle(
                                "active",
                                active
                            );


                            otherTab.setAttribute(
                                "aria-selected",
                                active
                                    ? "true"
                                    : "false"
                            );

                        }
                    );


                    // -----------------------------
                    // Update content
                    // -----------------------------

                    updateForYouProfile(
                        profileName
                    );

                }
            );

        });


        // Default profile

        updateForYouProfile(
            "health"
        );

    }
);
// =========================================================
// FOR YOU — UPDATE PERSONA DATA
// =========================================================

function updateForYou(data) {

    if (!data || !data.insights) {
        console.warn("For You data unavailable.");
        return;
    }

    const insights = data.insights;

    updateHealthPersona(insights.health);
    updateFitnessPersona(insights.fitness);
    updateBeachPersona(insights.beach);
    updateTravelPersona(insights.travel);
    updateFamilyPersona(insights.family);
    updateAgriculturePersona(insights.agriculture);
    updateCommutePersona(insights.commute);
    updateEventsPersona(insights.events);
}
function updateHealthPersona(data) {

    if (!data) return;

    const aqi = document.getElementById("for-you-aqi");
    const pollen = document.getElementById("for-you-pollen");
    const uv = document.getElementById("for-you-uv");
    const humidity = document.getElementById("for-you-humidity");
    const tip = document.getElementById("for-you-health-tip");

    if (aqi) {
        aqi.textContent =
            data.aqi !== null
                ? `${Math.round(data.aqi)} — ${data.aqi_label}`
                : "Unavailable";
    }

    if (pollen) {
        const values = [
            data.pollen?.grass?.value,
            data.pollen?.birch?.value,
            data.pollen?.ragweed?.value
        ].filter(v => v !== null && v !== undefined);

        pollen.textContent =
            values.length
                ? `${Math.round(Math.max(...values))} — ${data.pollen.grass.label}`
                : "No data";
    }

    if (uv) {
        uv.textContent =
            data.uv_index !== null
                ? `${data.uv_index} — ${data.uv_label}`
                : "No data";
    }

    if (humidity) {
        humidity.textContent =
            data.humidity !== null &&
            data.humidity !== undefined
                ? `${Math.round(data.humidity)}%`
                : "No data";
    }

    if (tip) {
        tip.textContent = data.tip || "";
    }
}

function updateFitnessPersona(data) {

    if (!data) return;

    const sunrise = document.getElementById("for-you-sunrise");
    const sunset = document.getElementById("for-you-sunset");
    const running = document.getElementById("for-you-running");
    const wind = document.getElementById("for-you-wind");
    const heat = document.getElementById("for-you-heat");
    const tip = document.getElementById("for-you-fitness-tip");

    if (sunrise) {
        sunrise.textContent =
            formatForYouTime(data.sunrise);
    }

    if (sunset) {
        sunset.textContent =
            formatForYouTime(data.sunset);
    }

    if (running) {
        running.textContent =
            data.best_running_window || "Unavailable";
    }

    if (wind) {
        wind.textContent =
            data.wind_speed_kmh !== null
                ? `${data.wind_speed_kmh} km/h`
                : "No data";
    }

    if (heat) {
        heat.textContent =
            data.heat_alert ? "Heat alert" : "No heat alert";
    }

    if (tip) {
        tip.textContent = data.tip || "";
    }
}
function formatForYouTime(value) {

    if (!value) return "Unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}
function updateBeachPersona(data) {

    if (!data) return;

    const wave = document.getElementById("for-you-wave");
    const seaTemp = document.getElementById("for-you-sea-temp");
    const condition = document.getElementById("for-you-sea-condition");
    const uv = document.getElementById("for-you-beach-uv");
    const tip = document.getElementById("for-you-beach-tip");

    if (wave) {
        wave.textContent =
            data.wave_height_m !== null
                ? `${data.wave_height_m} m`
                : "No data";
    }

    if (seaTemp) {
        seaTemp.textContent =
            data.sea_surface_temperature_c !== null
                ? `${data.sea_surface_temperature_c}°C`
                : "No data";
    }

    if (condition) {
        condition.textContent =
            data.condition_label || "Unknown";
    }

    if (uv) {
        uv.textContent =
            data.uv_index !== null
                ? `${data.uv_index} — ${data.uv_label}`
                : "No data";
    }

    if (tip) {
        tip.textContent = data.tip || "";
    }
}

function updateTravelPersona(data) {

    if (!data) return;

    const rain = document.getElementById("for-you-travel-rain");
    const flight = document.getElementById("for-you-flight-risk");
    const packing = document.getElementById("for-you-packing");

    if (rain) {
        rain.textContent =
            data.rain_delay_risk_percent !== null
                ? `${data.rain_delay_risk_percent}%`
                : "No data";
    }

    if (flight) {
        flight.textContent =
            data.flight_disruption_risk || "Unknown";
    }

    if (packing) {

        if (Array.isArray(data.packing_suggestions)) {

            packing.innerHTML = data.packing_suggestions
                .map(item => `<li>${item}</li>`)
                .join("");

        } else {

            packing.textContent = "No packing advice available.";
        }
    }
}
function updateFamilyPersona(data) {

    if (!data) return;

    const rain = document.getElementById("for-you-family-rain");
    const severe = document.getElementById("for-you-family-severe");
    const commute = document.getElementById("for-you-family-commute");
    const tip = document.getElementById("for-you-family-tip");

    if (rain) {
        rain.textContent =
            data.rain_probability_percent !== null
                ? `${data.rain_probability_percent}%`
                : "No data";
    }

    if (severe) {
        severe.textContent =
            data.severe_weather_day || "None expected";
    }

    if (commute) {
        commute.textContent =
            data.school_commute_caution || "Unknown";
    }

    if (tip) {
        tip.textContent = data.tip || "";
    }
}
function updateAgriculturePersona(data) {

    if (!data) return;

    const rainfall3 =
        document.getElementById("for-you-rainfall-3");

    const rainfall7 =
        document.getElementById("for-you-rainfall-7");

    const soil =
        document.getElementById("for-you-soil");

    const frost =
        document.getElementById("for-you-frost");

    const planting =
        document.getElementById("for-you-planting");

    const tip =
        document.getElementById("for-you-agriculture-tip");

    if (rainfall3) {
        rainfall3.textContent =
            `${data.rainfall_3day_mm} mm`;
    }

    if (rainfall7) {
        rainfall7.textContent =
            `${data.rainfall_7day_mm} mm`;
    }

    if (soil) {
        soil.textContent =
            data.soil_moisture_estimate || "Unknown";
    }

    if (frost) {
        frost.textContent =
            data.frost_risk_day || "No frost risk";
    }

    if (planting) {
        planting.textContent =
            data.planting_favorable
                ? "Favorable"
                : "Not ideal";
    }

    if (tip) {
        tip.textContent =
            data.planting_tip || "";
    }
}
function updateCommutePersona(data) {

    if (!data) return;

    const visibility =
        document.getElementById("for-you-visibility");

    const rain =
        document.getElementById("for-you-commute-rain");

    const fog =
        document.getElementById("for-you-fog");

    const caution =
        document.getElementById("for-you-commute-caution");

    const traffic =
        document.getElementById("for-you-traffic-note");

    if (visibility) {
        visibility.textContent =
            data.visibility_km !== null
                ? `${data.visibility_km} km`
                : "No data";
    }

    if (rain) {
        rain.textContent =
            `${data.rain_next_6h_percent}%`;
    }

    if (fog) {
        fog.textContent =
            data.fog_risk_next_6h
                ? "Fog possible"
                : "Low fog risk";
    }

    if (caution) {
        caution.textContent =
            data.caution_level || "Unknown";
    }

    if (traffic) {
        traffic.textContent =
            data.traffic_note || "";
    }
}
function updateEventsPersona(data) {

    if (!data) return;

    const comfort =
        document.getElementById("for-you-comfort");

    const rain =
        document.getElementById("for-you-event-rain");

    const forecast =
        document.getElementById("for-you-event-forecast");

    if (comfort) {

        if (data.comfort_index) {

            comfort.textContent =
                `${data.comfort_index.score}/100 — ${data.comfort_index.label}`;

        } else {

            comfort.textContent = "Unavailable";
        }
    }

    if (rain) {

        rain.textContent =
            data.rain_probability_percent !== null
                ? `${data.rain_probability_percent}%`
                : "No data";
    }

    if (forecast) {

        if (Array.isArray(data.extended_forecast)) {

            forecast.innerHTML =
                data.extended_forecast
                    .map(day => `
                        <div class="event-forecast-row">
                            <span>${formatForYouDate(day.date)}</span>
                            <span>${day.high_c}° / ${day.low_c}°</span>
                            <span>${day.rain_probability_percent}% rain</span>
                        </div>
                    `)
                    .join("");

        } else {

            forecast.textContent =
                "Extended forecast unavailable.";
        }
    }
}
function formatForYouDate(value) {

    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric"
    });
}
