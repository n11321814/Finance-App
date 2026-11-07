// ================================================================
// WEATHER & NEWS - Weather from Open-Meteo, news as links
// ================================================================

// ================================================================
// WEATHER (Brisbane, QLD) - Open-Meteo (free, no API key)
// ================================================================

const WMO_WEATHER = {
    0: ['☀️', 'Clear sky'], 1: ['🌤️', 'Mainly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
    45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'],
    51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Heavy drizzle'],
    56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'],
    61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
    66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
    71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['🌨️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
    80: ['🌦️', 'Rain showers'], 81: ['🌦️', 'Rain showers'], 82: ['⛈️', 'Violent showers'],
    85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Snow showers'],
    95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm, hail'], 99: ['⛈️', 'Thunderstorm, hail']
};

function weatherLookup(code) {
    return WMO_WEATHER[code] || ['🌡️', 'Unknown'];
}

async function fetchWithTimeout(url, ms = 8000, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function fetchWeather() {
    const el = document.getElementById('weatherWidget');
    if (!el) return;
    try {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=-27.4698&longitude=153.0251'
            + '&current=temperature_2m,weather_code'
            + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
            + '&timezone=Australia%2FBrisbane&forecast_days=7';
        const res = await fetchWithTimeout(url, 8000);
        if (!res.ok) throw new Error('Weather service returned ' + res.status);
        const data = await res.json();

        const [curIcon, curDesc] = weatherLookup(data.current.weather_code);
        const todayStr = new Date().toDateString();
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        const daysHtml = data.daily.time.map((dateStr, i) => {
            const [icon] = weatherLookup(data.daily.weather_code[i]);
            const high = Math.round(data.daily.temperature_2m_max[i]);
            const low = Math.round(data.daily.temperature_2m_min[i]);
            const rain = data.daily.precipitation_probability_max[i];
            const d = new Date(dateStr + 'T00:00:00');
            const isToday = d.toDateString() === todayStr;
            return `
                <div class="weather-day ${isToday ? 'is-today' : ''}">
                    <div class="day-name">${isToday ? 'Today' : dayNames[d.getDay()]}</div>
                    <div class="day-icon">${icon}</div>
                    <div><span class="day-high">${high}°</span><span class="day-low">${low}°</span></div>
                    <div class="day-rain ${rain < 30 ? 'low-chance' : ''}">💧 ${rain}%</div>
                </div>
            `;
        }).join('');

        el.innerHTML = `
            <div class="weather-current">
                <span class="icon">${curIcon}</span>
                <div>
                    <div class="temp">${Math.round(data.current.temperature_2m)}°C</div>
                    <div class="desc">${curDesc} · Brisbane, QLD</div>
                </div>
            </div>
            <div class="weather-days">${daysHtml}</div>
        `;
    } catch (err) {
        console.warn('Weather fetch failed:', err);
        el.innerHTML = `
            <div class="weather-error">
                <span style="font-size:20px;">⚠️</span>
                <span>Couldn't load the forecast (needs an internet connection). 
                <a href="https://www.bom.gov.au/qld/forecasts/brisbane.shtml" target="_blank" rel="noopener" style="color:var(--blue-light);">Check BOM instead</a></span>
            </div>
        `;
    }
}

// ================================================================
// NEWS - links only
// ABC's RSS feed doesn't allow browser requests, and the free relays
// that work around that see your IP address every time the app opens,
// so the panel just links out. (A server of our own could fetch the
// headlines once the app is hosted.)
// ================================================================

const NEWS_LINKS = [
    { icon: '📰', title: 'ABC News - Just In', url: 'https://www.abc.net.au/news/justin' },
    { icon: '🌏', title: 'ABC News - Brisbane', url: 'https://www.abc.net.au/news/brisbane' },
    { icon: '💼', title: 'ABC News - Business', url: 'https://www.abc.net.au/news/business' },
    { icon: '🏦', title: 'RBA - Cash rate decisions', url: 'https://www.rba.gov.au/statistics/cash-rate/' }
];

function fetchNews() {
    const el = document.getElementById('newsWidget');
    if (!el) return;
    el.innerHTML = `<div class="news-list">${NEWS_LINKS.map(link => `
        <a class="news-item" href="${link.url}" target="_blank" rel="noopener noreferrer">
            <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:28px;line-height:1;">${link.icon}</span>
                <div class="news-title">${link.title}</div>
            </div>
        </a>`).join('')}</div>`;
}
