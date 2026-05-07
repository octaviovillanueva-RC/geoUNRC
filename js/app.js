// ========== CONFIGURACIÓN ==========
// Puedes cambiar esta URL por tu archivo JSON local o remoto
const JSON_URL = '../data/lugares.json';  // Archivo local en la misma carpeta
// También puedes usar una URL remota: 'https://tusitio.com/datos/lugares.json'

let map = null;
let userMarker = null;
let placesLayer = null;
let placesData = [];
let markersVisible = true;
let isLocating = false;

// ========== INICIALIZAR MAPA ==========
function initMap() {
    // Centro por defecto (México DF como ejemplo, luego se moverá a tu ubicación)
    map = L.map('map').setView([19.4326, -99.1332], 13);
    
    // Capa de mapa bonita
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB',
        subdomains: 'abcd',
        maxZoom: 13
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
        setStatus(`✅ ${placesData.length} lugares cargados correctamente`);
        
    } catch (error) {
        console.error('Error cargando JSON:', error);
        setStatus(`⚠️ Error al cargar lugares: ${error.message}. Usando datos de ejemplo.`, true);
        
        // Datos de ejemplo por si no encuentra el archivo
        placesData = [
           
        ];
        renderPlaces(placesData);
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
    const placesWithDistance = placesData.map(place => {
        const lat = parseFloat(place.lat || place.latitude);
        const lng = parseFloat(place.lng || place.longitude);
        const distance = calculateDistance(userLat, userLng, lat, lng);
        return { ...place, distance };
    });
    
    // Ordenar por cercanía
    placesWithDistance.sort((a, b) => a.distance - b.distance);
    
    // Mostrar los 3 más cercanos en la info
    const closest = placesWithDistance.slice(0, 3);
    if (closest.length > 0) {
        let nearbyText = '<br><strong>📌 Más cercanos a ti:</strong><br>';
        closest.forEach(place => {
            nearbyText += `• ${place.nombre} (${place.distance.toFixed(1)} km)<br>`;
        });
        document.getElementById('statusMsg').innerHTML += nearbyText;
    }
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
    
    places.forEach(place => {
        const lat = parseFloat(place.lat || place.latitude);
        const lng = parseFloat(place.lng || place.longitude);
        const nombre = place.nombre || place.name || place.title || 'Lugar';
        const descripcion = place.descripcion || place.description || '';
        const categoria = place.categoria || place.category || '';
        const direccion = place.direccion || place.address || '';
        const telefono = place.telefono || place.phone || '';
        
        if (isNaN(lat) || isNaN(lng)) return;
        
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
                <b style="font-size: 16px; color: ${color};">${nombre}</b><br>
                ${categoria ? `<span style="color: #666;">🏷️ ${categoria}</span><br>` : ''}
                ${descripcion ? `📝 ${descripcion}<br>` : ''}
                ${direccion ? `📍 ${direccion}<br>` : ''}
                ${telefono ? `📞 ${telefono}<br>` : ''}
                <small>🗺️ ${lat.toFixed(5)}, ${lng.toFixed(5)}</small>
            </div>
        `;
        
        const marker = L.marker([lat, lng], { icon: customIcon })
            .bindPopup(popupContent)
            .on('click', () => {
                // Opcional: centrar el mapa en el lugar seleccionado
                map.setView([lat, lng], 16);
            });
        
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
        document.getElementById('toggleMarkersBtn').innerHTML = '👁️ Ocultar puntos';
        setStatus(`✅ Mostrando ${placesData.length} lugares en el mapa`);
    } else {
        placesLayer.clearLayers();
        document.getElementById('toggleMarkersBtn').innerHTML = '👁️ Mostrar puntos';
        setStatus('👻 Puntos ocultos temporalmente');
    }
}

// ========== ACTUALIZAR ESTADO EN UI ==========
function setStatus(message, isError = false) {
    const statusSpan = document.getElementById('statusMsg');
    if (statusSpan) {
        statusSpan.innerHTML = message;
        const infoDiv = document.getElementById('info');
        infoDiv.style.background = isError ? '#ffebee' : '#e3f2fd';
        infoDiv.style.color = isError ? '#c62828' : '#0d47a1';
    }
}

// ========== EVENT LISTENERS ==========
document.getElementById('toggleMarkersBtn').addEventListener('click', toggleMarkers);
document.getElementById('refreshLocationBtn').addEventListener('click', refreshLocation);

// ========== INICIAR APP ==========
document.addEventListener('DOMContentLoaded', initMap);