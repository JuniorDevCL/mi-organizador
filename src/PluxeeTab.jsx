import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const SANTIAGO_CENTER = [-33.4489, -70.6693]
const inputSt = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--border-light)', fontSize: 14, color: 'var(--text)',
  background: 'var(--bg-input)', outline: 'none', fontFamily: 'inherit',
}

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const formatDist = (km) => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`

const userIcon = L.divIcon({
  className: '',
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#378ADD;border:3px solid #fff;box-shadow:0 0 0 2px #378ADD88"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function MerchantClusters({ merchants, onSelect }) {
  const map = useMap()

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    })

    for (const m of merchants) {
      const marker = L.marker([m.lat, m.lng])
      marker.bindPopup(`<strong>${m.name}</strong><br>${m.category}<br>${m.address}<br>${m.locality}`)
      marker.on('click', () => onSelect(m.id))
      cluster.addLayer(marker)
    }

    map.addLayer(cluster)
    return () => map.removeLayer(cluster)
  }, [map, merchants, onSelect])

  return null
}

function MapRecenter({ userPos, selected }) {
  const map = useMap()
  const centeredUser = useRef(false)
  useEffect(() => {
    if (selected) {
      map.setView([selected.lat, selected.lng], 16, { animate: true })
    } else if (userPos && !centeredUser.current) {
      centeredUser.current = true
      map.setView([userPos.lat, userPos.lng], 13, { animate: true })
    }
  }, [map, userPos, selected])
  return null
}

export default function PluxeeTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [userPos, setUserPos] = useState(null)
  const [locError, setLocError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    fetch('/data/pluxee-santiago.json')
      .then(r => { if (!r.ok) throw new Error('No se pudo cargar la base local'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError('Tu navegador no soporta geolocalización')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocError('Activa la ubicación para ver dónde estás'),
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }, [])

  const categories = useMemo(() => {
    if (!data?.merchants) return []
    return [...new Set(data.merchants.map(m => m.category))].sort((a, b) => a.localeCompare(b, 'es'))
  }, [data])

  const filtered = useMemo(() => {
    if (!data?.merchants) return []
    const q = search.trim().toLowerCase()
    return data.merchants.filter(m => {
      if (category && m.category !== category) return false
      if (!q) return true
      return m.name.toLowerCase().includes(q)
        || m.address.toLowerCase().includes(q)
        || m.locality.toLowerCase().includes(q)
    })
  }, [data, search, category])

  const withDistance = useMemo(() => {
    if (!userPos) return filtered.map(m => ({ ...m, distKm: null }))
    return filtered
      .map(m => ({ ...m, distKm: haversineKm(userPos.lat, userPos.lng, m.lat, m.lng) }))
      .sort((a, b) => a.distKm - b.distKm)
  }, [filtered, userPos])

  const nearest = withDistance.slice(0, 8)
  const selected = selectedId ? withDistance.find(m => m.id === selectedId) : null
  const handleSelect = useCallback(id => setSelectedId(id), [])

  const lastUpdatedLabel = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleString('es-CL', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
        Cargando mapa Pluxee…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{
        background: 'var(--err-bg)', border: '1px solid var(--err-border)', borderRadius: 14,
        padding: 16, color: 'var(--err-text)', fontSize: 13, lineHeight: 1.5,
      }}>
        {error || 'Datos no disponibles'}
      </div>
    )
  }

  return (
    <div>
      <div style={{
        background: 'var(--info-bg)', borderRadius: 14, padding: '12px 14px', marginBottom: 12,
        border: '1px solid var(--info-border)', fontSize: 12, color: 'var(--info-text)', lineHeight: 1.5,
      }}>
        <strong>Pluxee Alimentación</strong> · {data.count} locales en Santiago (datos locales).
        {locError && <span style={{ display: 'block', marginTop: 6, color: 'var(--warn-text)' }}>{locError}</span>}
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar comercio, dirección, comuna…"
        style={{ ...inputSt, marginBottom: 8 }}
      />
      <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputSt, marginBottom: 12 }}>
        <option value="">Todas las categorías</option>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 1000,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', fontSize: 10, fontWeight: 600,
          color: 'var(--text-secondary)', boxShadow: '0 2px 8px var(--shadow)',
          maxWidth: 'calc(100% - 20px)',
        }}>
          Actualizado: {lastUpdatedLabel}
          <span style={{ display: 'block', marginTop: 2, color: 'var(--text-faint)', fontWeight: 500 }}>
            {filtered.length} en mapa
          </span>
        </div>

        <MapContainer
          center={SANTIAGO_CENTER}
          zoom={12}
          style={{ height: 360, width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MerchantClusters merchants={filtered} onSelect={handleSelect} />
          {userPos && (
            <>
              <Marker position={[userPos.lat, userPos.lng]} icon={userIcon}>
                <Popup>Tu ubicación</Popup>
              </Marker>
              <Circle
                center={[userPos.lat, userPos.lng]}
                radius={80}
                pathOptions={{ color: '#378ADD', fillColor: '#378ADD', fillOpacity: 0.15, weight: 1 }}
              />
            </>
          )}
          <MapRecenter userPos={userPos} selected={selected} />
        </MapContainer>
      </div>

      {userPos && nearest.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Más cercanos
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nearest.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                style={{
                  textAlign: 'left', background: selectedId === m.id ? 'var(--info-bg)' : 'var(--bg-card)',
                  border: `1px solid ${selectedId === m.id ? 'var(--info-border)' : 'var(--border)'}`,
                  borderRadius: 12, padding: '10px 12px', cursor: 'pointer', color: 'inherit',
                }}
              >
                <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{m.name.trim()}</p>
                <p style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>
                  {m.category} · {formatDist(m.distKm)} · {m.locality}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
