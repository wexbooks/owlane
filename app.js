document.addEventListener('DOMContentLoaded', () => {
    updateTime();
    setInterval(updateTime, 1000);
    
    fetchWeather();
    fetchTide();
    fetchBusETA();
    
    // Refresh API data every 60 seconds
    setInterval(() => {
        fetchWeather();
        fetchBusETA();
    }, 60000);
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

// 3. Tide Data (HKO Open Data - Quarry Bay Station)
async function fetchTide() {
    try {
        const response = await fetch('https://data.weather.gov.hk/weatherAPI/opendata/opendata.php?dataType=HLT&lang=en&rformat=json&station=QUB');
        const data = await response.json();
        
        if (!data || !data.data) throw new Error('No tide data');

        const tideHtml = data.data.slice(0, 4).map(t => `
            <div class="tide-row">
                <span>${t.type === 'H' ? 'High' : 'Low'} Tide</span>
                <span>${t.time} (${t.height}m)</span>
            </div>
        `).join('');
        
        document.getElementById('tide-info').innerHTML = tideHtml || '<p>No tides available</p>';
    } catch (error) {
        document.getElementById('tide-info').innerHTML = '<p>Tide data unavailable</p>';
    }
}

// 4. Bus ETA (KMB Open Data)
async function fetchBusETA() {
    // GITHUB PAGES LIMITATION: Because there is no backend to compute geospatial queries (closest stop), 
    // downloading the entire KMB route/stop geometry JSON to the client would crash the browser or cause massive latency.
    // Solution for Static Pages: Hardcode the user's specific home/work stop ID. 
    // Example Stop ID used here (you will need to replace this with your actual local stop ID from the KMB route API).
    const hardcodedStopId = '79842A7E2FC0844F'; 
    
    try {
        const response = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${hardcodedStopId}`);
        const data = await response.json();
        
        console.log("原始資料筆數:", data?.data?.length);
        const validEtas = data.data.filter(bus => bus.eta).slice(0, 4);
        console.log("過濾後筆數:", validEtas.length); // 如果這裡是 0，下面的式子就會是 true
        console.log("是否為空陣列:", validEtas.length === 0); // true
        
        if (validEtas.length === 0) {
            document.getElementById('bus-info').innerHTML = '<p>No upcoming buses</p>';
            return;
        }

        const etaHtml = validEtas.map(bus => {
            const etaTime = new Date(bus.eta).toLocaleTimeString('en-HK', {hour: '2-digit', minute: '2-digit', hour12: false});
            return `
                <div class="bus-row">
                    <span>
                        <span class="bus-route-num">${bus.route}</span> 
                        ${bus.dest_en}
                    </span>
                    <span class="bus-eta-time">${etaTime}</span>
                </div>
            `;
        }).join('');
        
        document.getElementById('bus-info').innerHTML = etaHtml;
    } catch (error) {
        document.getElementById('bus-info').innerHTML = '<p>Bus data unavailable</p>';
    }
}
