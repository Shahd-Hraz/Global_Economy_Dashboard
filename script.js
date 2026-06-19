let countryDetails = {}; 
let countryData = {}; 
let activePopup = null; // حارس لمنع تكرار الـ Popup

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
    style: 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
    center: [20, 20],
    zoom: 2
});

// 2. دالة جلب البيانات الاقتصادية
async function fetchGDPData(year) {
    try {
        const url = `https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&date=${year}&per_page=300`;
        const response = await fetch(url);
        const data = await response.json();
        countryData = {};
        data[1].forEach(item => { if (item.value) countryData[item.countryiso3code] = item.value; });
        if (map.getLayer('countries-layer')) updateMapStyles();
        updateTop5(); 
    } catch (error) { console.error("خطأ:", error); }
}

map.on('load', () => {
    map.addSource('countries', { 'type': 'geojson', 'data': './countries.geojson' });
    map.addLayer({ 'id': 'countries-layer', 'type': 'fill', 'source': 'countries', 'paint': { 'fill-color': '#f0f0f0', 'fill-outline-color': '#fff' }});
    map.addLayer({ 'id': 'country-labels', 'type': 'symbol', 'source': 'countries', 'layout': { 'text-field': ['get', 'name'], 'text-size': 11 }, 'paint': { 'text-color': '#333', 'text-halo-color': '#ffffff', 'text-halo-width': 1 }});
    fetchGDPData(2024);
});

// 3. الدالة المدمجة (تحديث اللوحة، الطقس، الرسم البياني، والـ Popup)
map.on('click', 'countries-layer', async (e) => {
    // 1. إغلاق أي نافذة مفتوحة سابقاً
    if (activePopup) activePopup.remove();

    const feature = e.features[0];
    const isoCode = feature.properties['ISO3166-1-Alpha-3'];
    const gdp = countryData[isoCode];
    const details = countryDetails[isoCode];

    // 2. تحديث اللوحة الجانبية
    document.getElementById('country-info').innerHTML = `
        <strong>${feature.properties.name}</strong><br>
        GDP: ${gdp ? (gdp / 1e9).toFixed(2) + ' Billion USD' : 'No Data'}<br>
        <hr>
        العاصمة: ${details ? details.capital : 'غير متوفر'}<br>
        اللغة: ${details ? details.languages : 'غير متوفر'}
    `;

    // 3. تحديث الرسم البياني (هذا هو السطر الجديد)
    updateGDPChart(isoCode); 

    // 4. جلب الطقس
    let temp = "جاري التحميل...";
    if (details && details.capital !== "غير متوفر") {
        try {
            const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${details.capital}&appid=c586bb1f0452c0acb223cfea83492a53&units=metric`);
            const data = await response.json();
            temp = data.main ? Math.round(data.main.temp) + "°C" : "غير متاح";
        } catch (err) { temp = "خطأ"; }
    }

    // 5. عرض الـ Popup الواحد
    activePopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat(e.lngLat)
        .setHTML(`
            <div style="direction: rtl; text-align: right; padding: 5px;">
                <strong style="color: #a50f15;">${feature.properties.name}</strong><br>
                العاصمة: ${details ? details.capital : '---'}<br>
                درجة الحرارة: ${temp} 🌡️
            </div>
        `)
        .addTo(map);
});
map.on('mousemove', 'countries-layer', (e) => {
    // 1. التأكد من أننا نلمس دولة
    if (e.features.length > 0) {
        const feature = e.features[0];
        const isoCode = feature.properties['ISO3166-1-Alpha-3'];
        const gdp = countryData[isoCode];
        const details = countryDetails[isoCode];

        // 2. تحديث الصندوق الجانبي فقط
        document.getElementById('country-info').innerHTML = `
            <strong>${feature.properties.name}</strong><br>
            GDP: ${gdp ? (gdp / 1e9).toFixed(2) + ' Billion USD' : 'No Data'}<br>
            <hr>
            العاصمة: ${details ? details.capital : 'غير متوفر'}<br>
            اللغة: ${details ? details.languages : 'غير متوفر'}
        `;
    }
});
// وظائف مساعدة
function updateMapStyles() {
    const expression = ['match', ['get', 'ISO3166-1-Alpha-3']];
    Object.entries(countryData).forEach(([code, val]) => {
        let color = val > 1e12 ? '#a50f15' : val > 5e11 ? '#de2d26' : val > 1e11 ? '#fb6a4a' : '#fcae91';
        expression.push(code, color);
    });
    expression.push('#f0f0f0'); 
    map.setPaintProperty('countries-layer', 'fill-color', expression);
}
function updateTop5() {
    // 1. استثناء الرموز الاقتصادية التي ليست دولاً
    const excluded = ['WLD', 'OED', 'ARB', 'EAP', 'EUU', 'EMU', 'TEA', 'TEC', 'PST', 'IBT', 'IBD', 'LMY', 'MIC', 'EAS', 'NAC', 'LTE', 'ECS', 'EAR', 'LCN', 'TLA', 'LAC', 'MEA'];
    
    // 2. الحصول على الأسماء من الخريطة
    const features = map.querySourceFeatures('countries'); 
    const nameMap = {};
    features.forEach(f => {
        if(f.properties['ISO3166-1-Alpha-3'] && f.properties['name']) {
            nameMap[f.properties['ISO3166-1-Alpha-3']] = f.properties['name'];
        }
    });

    // 3. ترتيب البيانات مع فلترة الرموز غير المرغوبة
    const sorted = Object.entries(countryData)
        .filter(([code, val]) => val && !excluded.includes(code))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); 
    
    // 4. بناء القائمة مع استبدال الرمز بالاسم
    let html = '<h4>📈 Top 5 Economies:</h4><ul>';
    sorted.forEach(([code, val]) => {
        const displayName = nameMap[code] || code; // استخدم الاسم إذا وجد، وإلا استخدم الرمز
        html += `<li><strong>${displayName}:</strong> ${(val / 1e12).toFixed(2)} T</li>`;
    });
    html += '</ul>';
    document.getElementById('stats-box').innerHTML = html;
}

map.on('mouseenter', 'countries-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'countries-layer', () => { map.getCanvas().style.cursor = ''; });
let myChart; // متغير لتعريف الرسم البياني

async function updateGDPChart(countryCode) {
    // جلب بيانات الناتج المحلي لدولة معينة من عام 2000 إلى 2024
    const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/NY.GDP.MKTP.CD?format=json&date=2000:2024&per_page=50`;
    const response = await fetch(url);
    const data = await response.json();
    
    // ترتيب البيانات من القديم للجديد
    const years = data[1].map(item => item.date).reverse();
    const values = data[1].map(item => item.value / 1e12).reverse(); // بالترليون

    const ctx = document.getElementById('gdpChart').getContext('2d');
    
    // إذا كان الرسم موجوداً مسبقاً، دمريه لننشئ واحداً جديداً
    if (myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                label: 'GDP (Trillion USD)',
                data: values,
                borderColor: '#a50f15',
                fill: true,
                tension: 0.3
            }]
        },
        options: { responsive: true }
    });
}
// أضيفي هذا الجزء في أسفل ملف script.js
document.getElementById('year-slider').addEventListener('input', (e) => {
    const selectedYear = e.target.value;
    
    // 1. تحديث النص الظاهر للمستخدم
    document.getElementById('year-value').innerText = selectedYear;
    
    // 2. استدعاء دالة جلب البيانات للسنة الجديدة
    fetchGDPData(selectedYear);
});