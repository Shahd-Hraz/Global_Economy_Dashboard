let countryDetails = {}; 
let countryData = {}; 
let activePopup = null; 
let myChart; 
let currentSelectedCountry = null; 

// 1. تحميل بيانات الدول
fetch('countries.json')
    .then(response => response.json())
    .then(data => {
        data.forEach(country => {
            countryDetails[country.cca3] = {
                capital: country.capital ? country.capital[0] : "غير متوفر",
                languages: country.languages ? Object.values(country.languages).join(', ') : "غير متوفر"
            };
        });
    });

const map = new maplibregl.Map({
    container: 'map',
    style: { version: 8, sources: {}, layers: [] },
    center: [20, 20],
    zoom: 2
});

// 2. إعداد الخرائط والبيانات
map.on('load', () => {
    map.addSource('osm-tiles', { 'type': 'raster', 'tiles': ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], 'tileSize': 256 });
    map.addSource('satellite-tiles', { 'type': 'raster', 'tiles': ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], 'tileSize': 256 });

    map.addLayer({ 'id': 'osm-layer', 'type': 'raster', 'source': 'osm-tiles' });
    map.addLayer({ 'id': 'satellite-layer', 'type': 'raster', 'source': 'satellite-tiles', 'layout': { 'visibility': 'none' } });

    map.addSource('countries', { 'type': 'geojson', 'data': './countries.geojson' });
    map.addLayer({ 'id': 'countries-layer', 'type': 'fill', 'source': 'countries', 'paint': { 'fill-color': '#f0f0f0', 'fill-outline-color': '#fff' }});
    map.addLayer({ 'id': 'country-labels', 'type': 'symbol', 'source': 'countries', 'layout': { 'text-field': ['get', 'name'], 'text-size': 11 }, 'paint': { 'text-color': '#333', 'text-halo-color': '#ffffff', 'text-halo-width': 1 }});
    
    fetchGDPData(2024);
});

// 3. ربط أزرار البيس ماب، الفلتر، والسنوات
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-osm')?.addEventListener('click', () => {
        map.setLayoutProperty('osm-layer', 'visibility', 'visible');
        map.setLayoutProperty('satellite-layer', 'visibility', 'none');
    });
    document.getElementById('btn-satellite')?.addEventListener('click', () => {
        map.setLayoutProperty('osm-layer', 'visibility', 'none');
        map.setLayoutProperty('satellite-layer', 'visibility', 'visible');
    });

    document.getElementById('gdp-filter')?.addEventListener('change', (e) => {
        updateMapStyles(parseFloat(e.target.value));
    });

    const yearSlider = document.getElementById('year-slider');
    const yearValue = document.getElementById('year-value');
    yearSlider?.addEventListener('input', function() {
        yearValue.innerText = this.value;
        fetchGDPData(this.value); 
        if (currentSelectedCountry) updateGDPChart(currentSelectedCountry);
    });
});

// 4. الدوال الرئيسية
async function fetchGDPData(year) {
    try {
        const response = await fetch(`https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&date=${year}&per_page=300`);
        const data = await response.json();
        countryData = {};
        data[1].forEach(item => { if (item.value) countryData[item.countryiso3code] = item.value; });
        updateMapStyles();
        updateTop5(); 
    } catch (error) { console.error("خطأ:", error); }
}

function updateMapStyles(minGDP = 0) {
    const expression = ['match', ['get', 'ISO3166-1-Alpha-3']];
    Object.entries(countryData).forEach(([code, val]) => {
        let color = val >= minGDP ? (val > 1e12 ? '#a50f15' : val > 5e11 ? '#de2d26' : '#fb6a4a') : '#eee';
        expression.push(code, color);
    });
    expression.push('#f0f0f0'); 
    map.setPaintProperty('countries-layer', 'fill-color', expression);
}

// 5. التفاعل مع الخريطة
function updateQuickInfo(feature) {
    const isoCode = feature.properties['ISO3166-1-Alpha-3'];
    const gdp = countryData[isoCode];
    const details = countryDetails[isoCode];
    document.getElementById('country-info').innerHTML = `
        <strong>${feature.properties.name}</strong><br>
        GDP: ${gdp ? (gdp / 1e9).toFixed(2) + ' Billion USD' : 'No Data'}<br>
        <hr>
        العاصمة: ${details ? details.capital : 'غير متوفر'}<br>
        اللغة: ${details ? details.languages : 'غير متوفر'}
    `;
}

map.on('click', 'countries-layer', async (e) => {
    if (activePopup) activePopup.remove();
    const feature = e.features[0];
    currentSelectedCountry = feature.properties['ISO3166-1-Alpha-3'];
    
    updateQuickInfo(feature);
    updateGDPChart(currentSelectedCountry); 
    
    let temp = "جاري التحميل...";
    if (countryDetails[currentSelectedCountry] && countryDetails[currentSelectedCountry].capital !== "غير متوفر") {
        try {
            const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${countryDetails[currentSelectedCountry].capital}&appid=c586bb1f0452c0acb223cfea83492a53&units=metric`);
            const data = await response.json();
            temp = data.main ? Math.round(data.main.temp) + "°C" : "غير متاح";
        } catch (err) { temp = "خطأ"; }
    }

    activePopup = new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<div style="direction: rtl; text-align: right; padding: 5px;"><strong>${feature.properties.name}</strong><br>العاصمة: ${countryDetails[currentSelectedCountry].capital}<br>درجة الحرارة: ${temp} 🌡️</div>`)
        .addTo(map);
});

map.on('mousemove', 'countries-layer', (e) => {
    if (e.features.length > 0) updateQuickInfo(e.features[0]);
});

async function updateGDPChart(countryCode) {
    const year = document.getElementById('year-slider').value;
    const response = await fetch(`https://api.worldbank.org/v2/country/${countryCode}/indicator/NY.GDP.MKTP.CD?format=json&date=${parseInt(year)-20}:${year}&per_page=50`);
    const data = await response.json();
    if (myChart) myChart.destroy();
    myChart = new Chart(document.getElementById('gdpChart').getContext('2d'), {
        type: 'line',
        data: { labels: data[1].map(item => item.date).reverse(), datasets: [{ label: 'GDP (Trillion USD)', data: data[1].map(item => item.value / 1e12).reverse(), borderColor: '#a50f15', fill: true }] },
        options: { responsive: true }
    });
}

function updateTop5() {
    const excluded = ['WLD', 'OED', 'ARB', 'EAP', 'EUU', 'EMU', 'TEA', 'TEC', 'PST', 'IBT', 'IBD', 'LMY', 'MIC', 'EAS', 'NAC', 'LTE', 'ECS', 'EAR', 'LCN', 'TLA', 'LAC', 'MEA'];
    const features = map.querySourceFeatures('countries'); 
    const nameMap = {};
    features.forEach(f => { if(f.properties['ISO3166-1-Alpha-3'] && f.properties['name']) nameMap[f.properties['ISO3166-1-Alpha-3']] = f.properties['name']; });

    const sorted = Object.entries(countryData)
        .filter(([code, val]) => val && !excluded.includes(code))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); 
    
    let html = '<h4>📈 Top 5 Economies:</h4><ul>';
    sorted.forEach(([code, val]) => {
        html += `<li><strong>${nameMap[code] || code}:</strong> ${(val / 1e12).toFixed(2)} T</li>`;
    });
    html += '</ul>';
    document.getElementById('stats-box').innerHTML = html;
}

map.on('mouseenter', 'countries-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'countries-layer', () => { map.getCanvas().style.cursor = ''; });