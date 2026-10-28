const map = L.map('map', {
    preferCanvas: false
}).setView([63.5, -151], 5);

// Basemaps
const streets = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }
);

const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
        attribution: 'Tiles © Esri',
        maxZoom: 19
    }
);

const topo = L.tileLayer(
    'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    {
        attribution: '© OpenTopoMap contributors',
        maxZoom: 17
    }
);

streets.addTo(map);

// Data layers
const glacierLayer = L.layerGroup().addTo(map);
const summitLayer = L.layerGroup().addTo(map);
const connectionLayer = L.layerGroup().addTo(map);

// Layer controls
L.control.layers(
    {
        'Street': streets,
        'Satellite': satellite,
        'Topographic': topo
    },
    {
        'Glaciers (blue)': glacierLayer,
        'Summits (orange)': summitLayer,
        'Selected glacier to nearest summit': connectionLayer
    },
    {
        collapsed: false
    }
).addTo(map);

L.control.scale({
    imperial: false
}).addTo(map);

// Calculate distance in kilometers
function haversine(a, b) {
    const R = 6371;
    const toRad = x => x * Math.PI / 180;

    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);

    const v =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) *
        Math.cos(toRad(b.lat)) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.asin(Math.min(1, Math.sqrt(v)));
}

// Keep popup text safe
function safe(s) {
    return String(s ?? 'Not available').replace(
        /[&<>"']/g,
        c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c])
    );
}

// Popup information
function markerPopup(f, type, extra = '') {
    return `
        <strong>${safe(f.name)}</strong><br>
        Type: ${type}<br>
        Elevation: ${f.elevation == null ? 'Not available' : safe(f.elevation) + ' m'}<br>
        Borough/area: ${safe(f.county)}<br>
        Map: ${safe(f.map)}
        ${extra}
    `;
}

// Load glacier and summit datasets
Promise.all([
    fetch('glaciers.json').then(r => {
        if (!r.ok) throw Error('Glacier data unavailable');
        return r.json();
    }),

    fetch('summits.json').then(r => {
        if (!r.ok) throw Error('Summit data unavailable');
        return r.json();
    })
])

.then(([glaciers, summits]) => {

    if (!glaciers.length || !summits.length) {
        throw Error('One of the datasets is empty');
    }

    const results = [];

    // Summit markers
    for (const s of summits) {

        const marker = L.circleMarker(
            [s.lat, s.lon],
            {
                radius: 5,
                color: '#a84b08',
                fillColor: '#f59e0b',
                fillOpacity: 0.8,
                weight: 1
            }
        );

        marker.bindPopup(markerPopup(s, 'Summit'));

        marker.addTo(summitLayer);
    }

    // Glacier markers
    for (const g of glaciers) {

        let closest = null;
        let best = Infinity;

        // Find nearest summit
        for (const s of summits) {
            const d = haversine(g, s);

            if (d < best) {
                best = d;
                closest = s;
            }
        }

        results.push(best);

        const extra = `
            <br>Nearest listed summit: ${safe(closest.name)}
            <br>Distance: ${best.toFixed(1)} km
        `;

        const marker = L.circleMarker(
            [g.lat, g.lon],
            {
                radius: 6,
                color: '#075b90',
                fillColor: '#38bdf8',
                fillOpacity: 0.85,
                weight: 1
            }
        );

        // Attach popup
        marker.bindPopup(
            markerPopup(g, 'Glacier', extra),
            {
                autoClose: true,
                closeOnClick: false,
                autoPan: true
            }
        );

        // Draw nearest summit connection
        marker.on('click', function () {

            connectionLayer.clearLayers();

            L.polyline(
                [
                    [g.lat, g.lon],
                    [closest.lat, closest.lon]
                ],
                {
                    color: '#8b5cf6',
                    weight: 3,
                    dashArray: '6,6',
                    interactive: false
                }
            ).addTo(connectionLayer);

        });

        marker.addTo(glacierLayer);
    }

    // Calculate analysis statistics
    results.sort((a, b) => a - b);

    const median = results.length % 2
        ? results[(results.length - 1) / 2]
        : (
            results[results.length / 2 - 1] +
            results[results.length / 2]
        ) / 2;

    const within = d => results.filter(x => x <= d).length;

    const metrics = [
        ['Glacier points', glaciers.length],
        ['Summit points', summits.length],
        ['Within 10 km', within(10)],
        ['Within 25 km', within(25)],
        ['Within 50 km', within(50)],
        ['Median nearest distance', median.toFixed(1) + ' km']
    ];

    // Display analysis results
    document.getElementById('results').innerHTML =
        '<div class="metric-grid">' +

        metrics.map(([label, val]) => `
            <div class="metric">
                <b>${val}</b>
                <span>${label}</span>
            </div>
        `).join('') +

        '</div>' +

        '<p>Of ' + glaciers.length +
        ' mapped glacier locations, ' +
        within(25) + ' (' +
        (100 * within(25) / glaciers.length).toFixed(1) +
        '%) are within 25 km of a named summit in the supplied summit dataset. ' +
        'These figures describe proximity among the supplied named points, ' +
        'not all Alaska terrain.</p>';

})

.catch(e => {

    document.getElementById('results').textContent =
        'Could not load datasets: ' + e.message +
        '. Open this project using VS Code Live Server or GitHub Pages.';

    console.error(e);

});