let currentProfile = 'work'; // Default init
let updateInterval;

document.addEventListener('DOMContentLoaded', () => {
    updateTime();
    setInterval(updateTime, 1000);
    
    fetchWeather();
    fetchTide();
    
    // Determine profile by time & day, then load tiles
    autoSelectProfile();
    
    // Background data refresh every 60 seconds
    updateInterval = setInterval(() => {
        fetchWeather();
        fetchBusETAForCurrentProfile();
    }, 60000);
});

// --- Profile & Routing Configuration ---
const profiles = {
    work: {
        '79842A7E2FC0844F': [{ route: '42M', dir: 'O' }, { route: '248M', dir: 'O' }],
        '26AC2D471648CA0C': [{ route: '43A', dir: 'O' }],
        'A453A24D622091F0': [{ route: 'X42C', dir: 'O' }, { route: '42C', dir: 'O' }],
        '79E9234905D6F856': [{ route: '42A', dir: 'O' }]
    },
    offwork: {
        '26A996F589C84844': [{ route: '42C', dir: 'I' }],
        'A7FCAD9C2AF7F468': [{ route: '248M', dir: 'O' }],
        '9E42D981C59B5762': [{ route: 'B10', dir: 'O' }]
    },
    holiday: {
        '9E42D981C59B5762': [{ route: 'B10', dir: 'O' }],
        '79842A7E2FC0844F': [{ route: '248M', dir: 'O' }, { route: '42M', dir: 'O' }],
        '26AC2D471648CA0C': [{ route: '43A', dir: 'O' }],
        'A453A24D622091F0': [{ route: 'X42C', dir: 'O' }, { route: '42C', dir: 'O' }],
        '79E9234905D6F856': [{ route: '42A', dir: 'O' }]
    }
};

// --- Time & Profile Logic ---
function autoSelectProfile() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sun, 6 = Sat
    const hour = now.getHours();
    
    // Note: Checking precise HK Public Holidays requires a live API. 
    // For this static site logic, we rely on weekends. 
    // (You can expand this with a hardcoded array of 2026 PH dates if needed)
    const isWeekend = (day === 0 || day === 6);
    
    if (isWeekend) {
        switchProfile('holiday');
    } else {
        // Weekdays: 00:00-11:59 is Work, 12:00-23:59 is Off-work
        if (hour < 12) {
            switchProfile('work');
        } else {
            switchProfile('offwork');
        }
    }
}

function switchProfile(profileKey) {
    currentProfile = profileKey;
    
    // Update button UI
    document.querySelectorAll('.profile-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.profile === profileKey);
    });
    
    renderBusTiles();
    fetchBusETAForCurrentProfile();
}

// --- Dynamic Bus Tiles UI ---
function renderBusTiles() {
    const dashboard = document.getElementById('dashboard');
    
    // Remove old bus tiles
    document.querySelectorAll('.bus-tile').forEach(el => el.remove());
    
    const activeConfig = profiles[currentProfile];
    
    for (const [stopId, routes] of Object.entries(activeConfig)) {
        routes.forEach(config => {
            const tile = document.createElement('section');
            tile.className = 'tile bus-tile';
            // Click to refresh this specific tile
            tile.onclick = () => refreshSingleTile(stopId, config.route, config.dir, tile);
            
            tile.innerHTML = `
                <h2 class="bus-title">
                    <span class="route-badge">${config.route}</span>
                    <span class="refresh-icon">🔄</span>
                </h2>
                <div id="bus-${stopId}-${config.route}-${config.dir}" class="tile-content">
                    <div class="loader"></div>
                </div>
            `;
            dashboard.appendChild(tile);
        });
    }
}

// --- Bus Data Fetching ---
async function fetchBusETAForCurrentProfile() {
    const activeConfig = profiles[currentProfile];
    
    for (const [stopId, routes] of Object.entries(activeConfig)) {
        try {
            const response = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${stopId}`);
            const data = await response.json();
            
            routes.forEach(config => {
                updateTileDOM(stopId, config.route, config.dir, data.data);
            });
        } catch (error) {
            console.error(`Error fetching Stop ${stopId}:`, error);
        }
    }
}

async function refreshSingleTile(stopId, route, dir, tileElement) {
    // Add animation
    tileElement.classList.add('refreshing');
    const container = document.getElementById(`bus-${stopId}-${route}-${dir}`);
    if (container) container.innerHTML = '<div class="loader"></div>';
    
    try {
        const response = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${stopId}`);
        const data = await response.json();
        updateTileDOM(stopId, route, dir, data.data);
    } catch (error) {
        if (container) container.innerHTML = '<p>Error refreshing</p>';
    } finally {
        // Remove animation after 500ms to ensure it's visible
        setTimeout(() => tileElement.classList.remove('refreshing'), 500);
    }
}

function updateTileDOM(stopId, route, dir, allStopData) {
    const container = document.getElementById(`bus-${stopId}-${route}-${dir}`);
    if (!container) return;

    // Filter by route and direction ('O'/'I' mapping to 0/1 fallback applied safely)
    const validEtas = allStopData
        .filter(bus => bus.route === route && (bus.dir === dir || bus.dir === (dir === 'O' ? '0' : '1')) && bus.eta)
        .slice(0, 3);
    
    if (validEtas.length === 0) {
        container.innerHTML = '<p>No upcoming buses</p>';
        return;
    }

    container.innerHTML = validEtas.map(bus => {
        const etaDate = new Date(bus.eta);
        const timeString = etaDate.toLocaleTimeString('en-HK', {hour: '2-digit', minute: '2-digit', hour12: false});
        
        const diffMs = etaDate - new Date();
        const diffMins = Math.max(0, Math.floor(diffMs / 60000));
        
        // Include Traditional Chinese dest and remarks
        const remarkHtml = bus.rmk_tc ? `<span class="bus-rmk">(${bus.rmk_tc})</span>` : '';
        
        return `
            <div class="bus-row">
                <span>往: ${bus.dest_tc} ${remarkHtml}</span>
                <div class="bus-eta-time">
                    <span style="color: var(--accent); font-weight: bold;">${timeString}</span>
                    <span class="bus-countdown">(${diffMins} min)</span>
                </div>
            </div>
        `;
    }).join('');
}

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
            
            fetchPromises.push(
                fetch(`${baseUrl}&year=${year}&month=${month}&day=${day}`)
                    .then(res => res.json())
                    .then(data => {
                        // data.data[0] is a row like: ["11", "12", "0312", "2.1", "0945", "0.6", ...]
                        const row = (data.data && data.data[0]) || [];
                        const events = [];

                        // Columns 0 & 1 are Month and Day; pairs of (Time, Height) start at index 2
                        for (let col = 2; col + 1 < row.length; col += 2) {
                            const rawTime = row[col]?.trim();
                            const rawHeight = row[col + 1]?.trim();

                            if (rawTime && rawHeight) {
                                // Format "0312" -> "03:12"
                                const formattedTime = rawTime.length === 4 
                                    ? `${rawTime.slice(0, 2)}:${rawTime.slice(2)}` 
                                    : rawTime;

                                events.push({
                                    time: formattedTime,
                                    height: parseFloat(rawHeight)
                                });
                            }
                        }

                        // Label High vs Low by comparing against the neighboring tide height
                        const tides = events.map((ev, idx, arr) => {
                            const neighbor = arr[idx + 1] || arr[idx - 1];
                            const type = neighbor && ev.height >= neighbor.height ? 'High' : 'Low';
                            return { ...ev, type };
                        });

                        return { dateStr: dateDisplay, tides };
                    })
                    .catch(() => ({ dateStr: dateDisplay, tides: [] }))
            );
        }
        
        const dailyResults = await Promise.all(fetchPromises);
        
        const tideHtml = dailyResults.flatMap(dayRecord => {
            return dayRecord.tides.map(t => `
                <div class="tide-row">
                    <span>
                        <span class="tide-date">${dayRecord.dateStr}</span> 
                        ${t.type}
                    </span>
                    <span>${t.time} (${t.height.toFixed(2)}m)</span>
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
