// ========== CONFIGURACIÓN ==========
// Puedes cambiar esta URL por tu archivo JSON local o remoto
const JSON_URL = './data/lugares.json';  // Archivo local en la misma carpeta
// También puedes usar una URL remota: 'https://tusitio.com/datos/lugares.json'

let map = null;
let userMarker = null;
let placesLayer = null;
let placesData = [];
let placeMarkers = new Map();
let markersVisible = true;
let isLocating = false;

function updateHeaderMetrics() {
    const totalPlacesEl = document.getElementById('totalPlaces');
    const markersStateEl = document.getElementById('markersState');

    if (totalPlacesEl) totalPlacesEl.textContent = String(placesData.length);
    if (markersStateEl) markersStateEl.textContent = markersVisible ? 'Activos' : 'Ocultos';
}

// ========== INICIALIZAR MAPA ==========
function initMap() {
    // Centro por defecto (México DF como ejemplo, luego se moverá a tu ubicación)
    map = L.map('map').setView([19.4326, -99.1332], 13);
    
    // Capa de mapa bonita
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);
    
    // Grupo para marcadores de lugares
    placesLayer = L.layerGroup().addTo(map);
    
    // Cargar los lugares del JSON
    loadPlacesFromJSON();
    
    // Obtener ubicación automáticamente
    getUserLocationAuto();
}

// ========== CARGAR JSON PRECARGADO ==========
async function loadPlacesFromJSON() {
    try {
        setStatus('📥 Cargando lugares desde el archivo...');
        
        const response = await fetch(JSON_URL);
        if (!response.ok) {
            throw new Error(`No se pudo cargar ${JSON_URL}`);
        }
        
        let data = await response.json();
        
        // Adaptar diferentes formatos de JSON
        if (!Array.isArray(data)) {
            if (data.lugares) data = data.lugares;
            else if (data.places) data = data.places;
            else if (data.features) { // GeoJSON
                data = data.features.map(f => ({
                    lat: f.geometry.coordinates[1],
                    lng: f.geometry.coordinates[0],
                    nombre: f.properties?.nombre || f.properties?.name || 'Lugar',
                    descripcion: f.properties?.descripcion || '',
                    direccion: f.properties?.direccion || '',
                    telefono: f.properties?.telefono || '',
                    categoria: f.properties?.categoria || ''
                }));
            }
            else throw new Error('Formato JSON no reconocido');
        }
        
        if (data.length === 0) throw new Error('No hay lugares en el JSON');
        
        placesData = data;
        renderPlaces(placesData);
        updateHeaderMetrics();
        setStatus(`✅ ${placesData.length} lugares cargados correctamente`);
        
    } catch (error) {
        console.error('Error cargando JSON:', error);
        setStatus(`⚠️ Error al cargar lugares: ${error.message}. Usando datos de ejemplo.`, true);
        
        // Datos de ejemplo por si no encuentra el archivo
        placesData = [
           
        ];
        renderPlaces(placesData);
        updateHeaderMetrics();
    }
}

// ========== OBTENER UBICACIÓN AUTOMÁTICA ==========
function getUserLocationAuto() {
    if (!navigator.geolocation) {
        setStatus('❌ Este navegador no soporta geolocalización', true);
        return;
    }
    
    isLocating = true;
    setStatus('📍 Obteniendo tu ubicación automáticamente...');
    
    // Opciones de alta precisión
    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            
            // Centrar el mapa en tu ubicación
            map.setView([latitude, longitude], 15);
            
            // Crear o actualizar marcador del usuario
            if (userMarker) {
                userMarker.setLatLng([latitude, longitude]);
            } else {
                // Marcador personalizado para el usuario
                const userIcon = L.divIcon({
                    className: 'user-location-marker',
                    html: '<div style="background: #2196f3; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>',
                    iconSize: [26, 26],
                    popupAnchor: [0, -13]
                });
                
                userMarker = L.marker([latitude, longitude], { icon: userIcon })
                    .bindPopup(`
                        <b>🌍 Tu ubicación</b><br>
                        <small>Precisión: ±${Math.round(accuracy)} metros</small>
                    `)
                    .addTo(map);
            }
            
            // Mostrar información de precisión
            let accuracyText = accuracy ? ` (precisión ±${Math.round(accuracy)}m)` : '';
            setStatus(`✅ Ubicación obtenida: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accuracyText}`);
            
            // Opcional: calcular y mostrar lugares cercanos
            showNearbyPlaces(latitude, longitude);
            
            isLocating = false;
        },
        (error) => {
            let errorMsg = '';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = 'Permiso denegado. Habilita la ubicación en tu navegador.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = 'Ubicación no disponible. Verifica tu GPS/WiFi.';
                    break;
                case error.TIMEOUT:
                    errorMsg = 'Tiempo de espera agotado. Reintentando...';
                    setTimeout(() => getUserLocationAuto(), 3000);
                    break;
                default:
                    errorMsg = 'Error desconocido';
            }
            setStatus(`❌ ${errorMsg}`, true);
            isLocating = false;
        },
        options
    );
}

// ========== MOSTRAR LUGARES CERCANOS (OPCIONAL) ==========
function showNearbyPlaces(userLat, userLng) {
    // Calcular distancia entre tu ubicación y cada lugar
    const placesWithDistance = placesData.map((place, index) => {
        const coords = getPlaceCoordinates(place);
        if (!coords) return null;

        const { lat, lng } = coords;
        const distance = calculateDistance(userLat, userLng, lat, lng);
        return { ...place, distance, index };
    }).filter(Boolean);
    
    // Ordenar por cercanía
    placesWithDistance.sort((a, b) => a.distance - b.distance);
    
    // Mostrar los 3 más cercanos en la info
    const closest = placesWithDistance.slice(0, 3);
    if (closest.length > 0) {
        let nearbyText = '<div class="nearby-places"><strong>📌 Más cercanos a ti:</strong><div class="nearby-list">';
        closest.forEach(place => {
            nearbyText += `
                <button class="nearby-place-btn btn btn-light" type="button" data-place-index="${place.index}">
                    <span>${escapeHTML(getPlaceName(place))}</span>
                    <small>${place.distance.toFixed(1)} km</small>
                </button>
            `;
        });
        nearbyText += '</div></div>';
        document.getElementById('statusMsg').innerHTML += nearbyText;
    }
}

// ========== ENFOCAR LUGAR SELECCIONADO ==========
function focusPlace(placeIndex) {
    const place = placesData[placeIndex];
    const coords = getPlaceCoordinates(place);
    if (!coords) return;

    if (!markersVisible) {
        markersVisible = true;
        renderPlaces(placesData);
        document.getElementById('toggleMarkersBtn').textContent = 'Ocultar puntos';
        updateHeaderMetrics();
    }

    map.setView([coords.lat, coords.lng], 17);

    const marker = placeMarkers.get(placeIndex);
    if (marker) {
        marker.openPopup();
    }
}

function getPlaceCoordinates(place) {
    if (!place) return null;

    const lat = parseFloat(place.lat || place.latitude);
    const lng = parseFloat(place.lng || place.longitude);

    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
}

function getPlaceName(place) {
    return place?.nombre || place?.name || place?.title || 'Lugar';
}

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ========== CÁLCULO DE DISTANCIA (Haversine) ==========
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// ========== RENDERIZAR LUGARES EN EL MAPA ==========
function renderPlaces(places) {
    placesLayer.clearLayers();
    placeMarkers.clear();
    if (!markersVisible) return;
    
    // Colores por categoría (opcional)
    const categoryColors = {
        'Turismo': '#FF6B6B',
        'Cultura': '#4ECDC4',
        'Monumento': '#FFE66D',
        'Museo': '#95E77C',
        'Restaurante': '#FF8C42',
        'default': '#2196f3'
    };
    
    places.forEach((place, index) => {
        const coords = getPlaceCoordinates(place);
        if (!coords) return;

        const { lat, lng } = coords;
        const nombre = getPlaceName(place);
        const descripcion = place.descripcion || place.description || '';
        const categoria = place.categoria || place.category || '';
        const direccion = place.direccion || place.address || '';
        const telefono = place.telefono || place.phone || '';
        
        // Color según categoría
        const color = categoryColors[categoria] || categoryColors.default;
        
        // Marcador personalizado con ícono
        const customIcon = L.divIcon({
            html: `<div style="background: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                      <span style="color: white; font-size: 16px;">📍</span>
                   </div>`,
            iconSize: [30, 30],
            popupAnchor: [0, -15]
        });
        
        // Contenido del popup mejorado
        let popupContent = `
            <div style="min-width: 200px;">
                <b style="font-size: 16px; color: ${color};">${escapeHTML(nombre)}</b><br>
                ${categoria ? `<span style="color: #666;">🏷️ ${escapeHTML(categoria)}</span><br>` : ''}
                ${descripcion ? `📝 ${escapeHTML(descripcion)}<br>` : ''}
                ${direccion ? `📍 ${escapeHTML(direccion)}<br>` : ''}
                ${telefono ? `📞 ${escapeHTML(telefono)}<br>` : ''}
                <small>🗺️ ${lat.toFixed(5)}, ${lng.toFixed(5)}</small>
            </div>
        `;
        
        const marker = L.marker([lat, lng], { icon: customIcon })
            .bindPopup(popupContent)
            .on('click', () => {
                // Opcional: centrar el mapa en el lugar seleccionado
                map.setView([lat, lng], 16);
            });
        
        placeMarkers.set(index, marker);
        placesLayer.addLayer(marker);
    });
}

// ========== ACTUALIZAR UBICACIÓN MANUALMENTE ==========
function refreshLocation() {
    setStatus('🔄 Actualizando ubicación...');
    getUserLocationAuto();
}

// ========== TOGGLE MARCadores ==========
function toggleMarkers() {
    markersVisible = !markersVisible;
    if (markersVisible) {
        renderPlaces(placesData);
        document.getElementById('toggleMarkersBtn').textContent = 'Ocultar puntos';
        updateHeaderMetrics();
        setStatus(`✅ Mostrando ${placesData.length} lugares en el mapa`);
    } else {
        placesLayer.clearLayers();
        document.getElementById('toggleMarkersBtn').textContent = 'Mostrar puntos';
        updateHeaderMetrics();
        setStatus('👻 Puntos ocultos temporalmente');
    }
}

// ========== ACTUALIZAR ESTADO EN UI ==========
function setStatus(message, isError = false) {
    const statusSpan = document.getElementById('statusMsg');
    if (statusSpan) {
        statusSpan.innerHTML = message;
        const infoDiv = document.getElementById('info');
        infoDiv.classList.toggle('alert-primary', !isError);
        infoDiv.classList.toggle('alert-danger', isError);
    }
}

// ========== EVENT LISTENERS ==========
document.getElementById('toggleMarkersBtn').addEventListener('click', toggleMarkers);
document.getElementById('refreshLocationBtn').addEventListener('click', refreshLocation);
document.getElementById('info').addEventListener('click', (event) => {
    const nearbyButton = event.target.closest('.nearby-place-btn');
    if (!nearbyButton) return;

    const placeIndex = Number(nearbyButton.dataset.placeIndex);
    if (Number.isInteger(placeIndex)) {
        focusPlace(placeIndex);
    }
});

// ========== INICIAR APP ==========
document.addEventListener('DOMContentLoaded', initMap);
