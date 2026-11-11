document.addEventListener('DOMContentLoaded', () => {
    updateTime();
    setInterval(updateTime, 1000);
    
    fetchWeather();
    fetchTide();
    
    // Initialize Bus Tiles in the DOM before fetching data
    initializeBusTiles();
    fetchBusETA();
    
    setInterval(() => {
        fetchWeather();
        fetchBusETA();
    }, 60000); // Refresh API data every 60 seconds
});

// 1. Current Time
function updateTime() {
    const now = new Date();
    document.getElementById('time').textContent = now.toLocaleTimeString('en-HK', { hour12: false });
    document.getElementById('date').textContent = now.toLocaleDateString('en-HK', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
}

// 2. Weather (HKO Open Data)
async function fetchWeather() {
    try {
        const response = await fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en');
        const data = await response.json();
        
        // Isolate HKO's temperature reading
        const hkoTemp = data.temperature.data.find(d => d.place === 'Hong Kong Observatory')?.value || '--';
        const humidity = data.humidity.data[0].value || '--';
        
        document.getElementById('weather-info').innerHTML = `
            <div class="weather-metric">🌡️ Temperature: ${hkoTemp}°C</div>
            <div class="weather-metric">💧 Humidity: ${humidity}%</div>
            <div class="weather-metric">⚠️ Warning: ${data.warningMessage || 'None'}</div>
        `;
    } catch (error) {
        document.getElementById('weather-info').innerHTML = '<p>Weather data unavailable</p>';
    }
}

// 3. Tide Data (HKO Open Data - Tai Po Kau Station, 3-Day Forecast)
async function fetchTide() {
    const station = 'TPK';
    const baseUrl = `https://data.weather.gov.hk/weatherAPI/opendata/opendata.php?dataType=HLT&station=${station}&rformat=json`;
    
    try {
        const fetchPromises = [];
        
        // Generate API calls for Today + Next 2 Days
        for (let i = 0; i < 3; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i);
            
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const dateDisplay = `${month}/${day}`; // e.g., "11/12"
            
            // Push the fetch promise into an array for parallel execution
            fetchPromises.push(
                fetch(`${baseUrl}&year=${year}&month=${month}&day=${day}`)
                    .then(res => res.json())
                    .then(data => ({ 
                        dateStr: dateDisplay, 
                        tides: data.data || [] 
                    }))
                    .catch(() => ({ dateStr: dateDisplay, tides: [] })) // Handle individual day failures gracefully
            );
        }
        
        // Wait for all 3 API calls to resolve
        const dailyResults = await Promise.all(fetchPromises);
        
        // Flatten the array of days into a single HTML string
        const tideHtml = dailyResults.flatMap(dayRecord => {
            return dayRecord.tides.map(t => `
                <div class="tide-row">
                    <span>
                        <span class="tide-date">${dayRecord.dateStr}</span> 
                        ${t.type === 'H' ? 'High' : 'Low'}
                    </span>
                    <span>${t.time} (${t.height}m)</span>
                </div>
            `);
        }).join('');
        
        document.getElementById('tide-info').innerHTML = tideHtml || '<p>No tides available</p>';
        
    } catch (error) {
        console.error("Tide fetch error:", error);
        document.getElementById('tide-info').innerHTML = '<p>Tide data unavailable</p>';
    }
}

// --- NEW BUS ETA LOGIC ---
// Configuration for 7 Bus Tiles across 5 Stops with Direction filtering
// Note: KMB uses 'O' (Outbound) and 'I' (Inbound). 0 is mapped to 'O'.
const busConfiguration = {
    '79842A7E2FC0844F': [
        { route: '42M', dir: 'O' }, 
        { route: '248M', dir: 'O' }
    ],
    '26AC2D471648CA0C': [
        { route: '43A', dir: 'O' }
    ],
    'A453A24D622091F0': [
        { route: 'X42C', dir: 'O' }, 
        { route: '42C', dir: 'O' }
    ],
    '79E9234905D6F856': [
        { route: '42A', dir: 'O' }
    ],
    '9E42D981C59B5762': [
        { route: 'B10', dir: 'O' }
    ]
};

function initializeBusTiles() {
    const dashboard = document.getElementById('dashboard');
    
    // Create the 7 tiles dynamically based on the configuration
    for (const [stopId, configs] of Object.entries(busConfiguration)) {
        configs.forEach(config => {
            const tile = document.createElement('section');
            tile.className = 'tile bus-tile';
            // Unique ID requires both route and dir to prevent overwriting
            tile.innerHTML = `
                <h2 class="bus-title">
                    <span class="route-badge">${config.route}</span>
                </h2>
                <div id="bus-${stopId}-${config.route}-${config.dir}" class="tile-content">
                    <div class="loader"></div>
                </div>
            `;
            dashboard.appendChild(tile);
        });
    }
}

async function fetchBusETA() {
    for (const [stopId, configs] of Object.entries(busConfiguration)) {
        try {
            // Fetch once per stop ID (5 calls total)
            const response = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${stopId}`);
            const data = await response.json();
            
            configs.forEach(config => {
                const container = document.getElementById(`bus-${stopId}-${config.route}-${config.dir}`);
                if (!container) return;

                // Filter data for this specific route AND direction, ensure ETA exists, and limit to 3 buses
                const validEtas = data.data
                    .filter(bus => bus.route === config.route && (bus.dir === config.dir || bus.dir === '0') && bus.eta)
                    .slice(0, 3);
                
                if (validEtas.length === 0) {
                    container.innerHTML = '<p>No upcoming buses</p>';
                    return;
                }

                container.innerHTML = validEtas.map(bus => {
                    const etaDate = new Date(bus.eta);
                    const timeString = etaDate.toLocaleTimeString('en-HK', {hour: '2-digit', minute: '2-digit', hour12: false});
                    
                    // Calculate countdown in minutes
                    const diffMs = etaDate - new Date();
                    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
                    
                    return `
                        <div class="bus-row">
                            <span>To: ${bus.dest_en}</span>
                            <div class="bus-eta-time">
                                <span style="color: var(--accent); font-weight: bold;">${timeString}</span>
                                <span class="bus-countdown">(${diffMins} min)</span>
                            </div>
                        </div>
                    `;
                }).join('');
            });
        } catch (error) {
            console.error(`Bus ETA fetch error for stop ${stopId}:`, error);
            configs.forEach(config => {
                const container = document.getElementById(`bus-${stopId}-${config.route}-${config.dir}`);
                if (container) container.innerHTML = '<p>Data unavailable</p>';
            });
        }
    }
}
